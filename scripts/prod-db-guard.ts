/**
 * The production-migration guard. Node-safe: no Next imports, no database driver.
 *
 * The mirror image of `local-db-guard.ts`: it refuses anything on this machine or named
 * like a local database, so `db:deploy:prod` can only ever reach the remote production
 * database, and the local guards stay untouched (they still refuse every remote URL).
 *
 * Error messages never contain the URL or the password, so a failure is safe to paste.
 */
import { UnsafeDatabaseError, EXPECTED_DATABASE } from "./local-db-guard";

const LOCAL_HOSTS: readonly string[] = ["localhost", "127.0.0.1", "[::1]", "::1"];
const LOCAL_DATABASES: readonly string[] = Object.values(EXPECTED_DATABASE);

/**
 * Query parameters that only tune the connection, including the ones Neon puts in its
 * strings. Anything else (`host`, `hostaddr`, `dbname`, `port`, `service`, ...) could point
 * the connection elsewhere, even at this machine through a Unix socket.
 */
const ALLOWED_PARAMS: ReadonlySet<string> = new Set([
  "sslmode",
  "channel_binding",
  "connect_timeout",
  "schema",
  "pgbouncer",
  "connection_limit",
  "pool_timeout",
]);

export interface ProductionTarget {
  host: string;
  /**
   * The first part of the host, e.g. `ep-cool-name-123` on Neon. Unique per database endpoint,
   * unlike the database name (every Neon database defaults to `neondb`), so it is what the
   * person types to confirm a deploy.
   */
  endpoint: string;
  database: string;
}

/** `ep-x-123-pooler.eu-central-1.aws.neon.tech` → `ep-x-123`. */
function endpointOf(host: string): string {
  return host.split(".")[0].replace(/-pooler$/, "");
}

export interface ProductionEnv {
  PROD_DATABASE_URL?: string;
  PROD_DIRECT_URL?: string;
}

function parse(name: string, value: string | undefined): { host: string; database: string } {
  const refuse = (reason: string): never => {
    throw new UnsafeDatabaseError(`${name} ${reason}. Nothing was run.`);
  };

  if (value === undefined || value.trim() === "") return refuse("is not set");
  const raw = value.trim();
  if ((raw.match(/:\/\//g) ?? []).length !== 1) return refuse("is not a single connection string");
  if (!/^postgres(?:ql)?:\/\//i.test(raw)) return refuse("is not a PostgreSQL connection string");
  if (/\s/.test(raw)) return refuse("contains whitespace");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return refuse("is not a valid connection string");
  }

  const host = url.hostname.toLowerCase();
  if (!host || LOCAL_HOSTS.includes(host)) return refuse("points at this machine, not the production database");

  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_PARAMS.has(key.toLowerCase())) return refuse(`has the parameter "${key}", which is not allowed`);
  }

  let database: string;
  try {
    database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  } catch {
    return refuse("has an unreadable database name");
  }
  if (!database) return refuse("does not name a database");
  if (LOCAL_DATABASES.includes(database)) return refuse(`names the local database ${database}`);

  return { host, database };
}

/** Checks both production values and returns where a migration would go. */
export function assertProductionUrls(env: ProductionEnv): ProductionTarget {
  const pooled = parse("PROD_DATABASE_URL", env.PROD_DATABASE_URL);
  const direct = parse("PROD_DIRECT_URL", env.PROD_DIRECT_URL);

  if (direct.host.includes("-pooler")) {
    throw new UnsafeDatabaseError(
      "PROD_DIRECT_URL must be the direct connection (Neon: without -pooler), not the pooled one. Nothing was run.",
    );
  }
  if (endpointOf(pooled.host) !== endpointOf(direct.host)) {
    throw new UnsafeDatabaseError(
      "PROD_DATABASE_URL and PROD_DIRECT_URL must point at the same Neon endpoint. Nothing was run.",
    );
  }
  if (pooled.database !== direct.database) {
    throw new UnsafeDatabaseError(
      "PROD_DATABASE_URL and PROD_DIRECT_URL must name the same database. Nothing was run.",
    );
  }
  return { host: direct.host, endpoint: endpointOf(direct.host), database: direct.database };
}

export interface ProductionClient {
  $queryRaw: (query: TemplateStringsArray, ...values: never[]) => Promise<unknown>;
  $disconnect: () => Promise<void>;
}

export interface ProductionRunDeps {
  makeClient: (databaseUrl: string) => ProductionClient;
  spawn: (command: string, args: string[], env: NodeJS.ProcessEnv) => number;
  /** Asks the person a question and returns what they typed. */
  ask: (question: string) => Promise<string>;
  report: (line: string) => void;
}

export interface ProductionRunOptions {
  mode: "status" | "deploy";
  env: ProductionEnv;
  /** The endpoint name given up front (`--confirm <endpoint>`), instead of asking. */
  confirm?: string;
}

const LOOPBACK_ADDRESSES: readonly string[] = ["127.0.0.1", "::1"];

/**
 * status: check the target, then `prisma migrate status` (read-only).
 * deploy: the same, then the person types the endpoint name, then `prisma migrate deploy`.
 * Nothing else can run: no reset, no seed, no push.
 */
export async function runProductionMigrate(options: ProductionRunOptions, deps: ProductionRunDeps): Promise<number> {
  const fail = (message: string): number => {
    deps.report(`\n✖ ${message}\n`);
    return 1;
  };

  let target: ProductionTarget;
  try {
    target = assertProductionUrls(options.env);
  } catch (err) {
    return fail(err instanceof UnsafeDatabaseError ? err.message : "The production URLs could not be checked. Nothing was run.");
  }

  const direct = options.env.PROD_DIRECT_URL as string;
  const client = deps.makeClient(direct);
  try {
    const rows = await client.$queryRaw`SELECT current_database() AS database, host(inet_server_addr()) AS addr`;
    const row = Array.isArray(rows) ? (rows[0] as { database?: unknown; addr?: unknown } | undefined) : undefined;
    if (!row || row.database !== target.database) {
      return fail(`The connected database is not ${target.database}. Nothing was run.`);
    }
    // No address means a Unix-socket connection, which is always this machine: fail closed.
    if (typeof row.addr !== "string" || LOOPBACK_ADDRESSES.includes(row.addr)) {
      return fail("The connected server is on this machine, not production. Nothing was run.");
    }
  } catch {
    return fail("Could not connect to confirm which database this is. Nothing was run.");
  } finally {
    await client.$disconnect().catch(() => undefined);
  }

  const env = {
    ...process.env,
    DATABASE_URL: options.env.PROD_DATABASE_URL,
    DIRECT_URL: direct,
  } as NodeJS.ProcessEnv;

  deps.report(`\nProduction database: ${target.host} / ${target.database}\n`);
  // `migrate status` exits non-zero when migrations are pending; that is information, not failure.
  const statusCode = deps.spawn("prisma", ["migrate", "status"], env);
  if (options.mode === "status") return statusCode;

  const typed =
    options.confirm ??
    (await deps.ask(`\nType the endpoint name (${target.endpoint}) to apply the pending migrations to PRODUCTION: `));
  if (typed.trim() !== target.endpoint) {
    return fail("The name did not match. No migration was applied.");
  }

  return deps.spawn("prisma", ["migrate", "deploy"], env);
}
