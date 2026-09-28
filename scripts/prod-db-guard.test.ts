import { describe, it, expect } from "vitest";
import { assertProductionUrls, runProductionMigrate, type ProductionRunDeps } from "./prod-db-guard";

const POOLED = "postgresql://owner:s3cret@ep-cool-name-123-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const DIRECT = "postgresql://owner:s3cret@ep-cool-name-123.eu-central-1.aws.neon.tech/neondb?sslmode=require";

describe("assertProductionUrls: which production connection strings may be migrated", () => {
  it("accepts a remote database and returns host and name, never the password", () => {
    const target = assertProductionUrls({ PROD_DATABASE_URL: POOLED, PROD_DIRECT_URL: DIRECT });
    expect(target).toEqual({
      host: "ep-cool-name-123.eu-central-1.aws.neon.tech",
      endpoint: "ep-cool-name-123",
      database: "neondb",
    });
    expect(JSON.stringify(target)).not.toContain("s3cret");
  });

  it("refuses when either value is missing", () => {
    expect(() => assertProductionUrls({ PROD_DIRECT_URL: DIRECT })).toThrow(/PROD_DATABASE_URL is not set/);
    expect(() => assertProductionUrls({ PROD_DATABASE_URL: POOLED })).toThrow(/PROD_DIRECT_URL is not set/);
  });

  it("refuses the local databases, so this never runs against this machine", () => {
    for (const local of [
      "postgresql://postgres:pw@127.0.0.1:5432/ivo_dev",
      "postgresql://postgres:pw@localhost:5432/other",
      "postgresql://postgres:pw@[::1]:5432/other",
      "postgresql://postgres:pw@remote.example.com:5432/ivo_test",
    ]) {
      expect(() => assertProductionUrls({ PROD_DATABASE_URL: local, PROD_DIRECT_URL: local })).toThrow(/Nothing was run/);
    }
  });

  it("refuses a pooled address for the direct connection that migrations need", () => {
    expect(() => assertProductionUrls({ PROD_DATABASE_URL: POOLED, PROD_DIRECT_URL: POOLED })).toThrow(
      /PROD_DIRECT_URL must be the direct .*not the pooled/,
    );
  });

  it("refuses when the two values point at different Neon endpoints (e.g. production and a dev branch)", () => {
    const devBranch = DIRECT.replace("ep-cool-name-123", "ep-other-branch-456");
    expect(() => assertProductionUrls({ PROD_DATABASE_URL: POOLED, PROD_DIRECT_URL: devBranch })).toThrow(/same Neon endpoint/);
  });

  it("refuses when the two values name different databases", () => {
    const otherDb = DIRECT.replace("/neondb", "/otherdb");
    expect(() => assertProductionUrls({ PROD_DATABASE_URL: POOLED, PROD_DIRECT_URL: otherDb })).toThrow(/same database/);
  });

  it("accepts the parameters Neon puts in its connection strings", () => {
    const neon = (url: string) => `${url}&channel_binding=require&connect_timeout=15`;
    expect(assertProductionUrls({ PROD_DATABASE_URL: neon(POOLED), PROD_DIRECT_URL: neon(DIRECT) }).database).toBe("neondb");
  });

  it("refuses a parameter that could send the connection somewhere else", () => {
    for (const param of ["host=/var/run/postgresql", "hostaddr=127.0.0.1", "dbname=ivo_dev", "port=5432", "service=local"]) {
      expect(() => assertProductionUrls({ PROD_DATABASE_URL: POOLED, PROD_DIRECT_URL: `${DIRECT}&${param}` })).toThrow(
        /is not allowed/,
      );
      expect(() => assertProductionUrls({ PROD_DATABASE_URL: `${POOLED}&${param}`, PROD_DIRECT_URL: DIRECT })).toThrow(
        /is not allowed/,
      );
    }
  });

  it("refuses a value pasted twice, and never echoes it", () => {
    try {
      assertProductionUrls({ PROD_DATABASE_URL: POOLED + POOLED, PROD_DIRECT_URL: DIRECT });
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toMatch(/single connection string/);
      expect((err as Error).message).not.toContain("s3cret");
    }
  });
});

describe("runProductionMigrate: migrations reach production only after every check and a typed confirmation", () => {
  const env = { PROD_DATABASE_URL: POOLED, PROD_DIRECT_URL: DIRECT };

  function deps(opts: { answer?: unknown[] | Error; typed?: string } = {}) {
    const log: string[] = [];
    const lines: string[] = [];
    const answer = opts.answer ?? [{ database: "neondb", addr: "3.64.10.20" }];
    const d: ProductionRunDeps = {
      makeClient: (url) => {
        log.push(`client:${url === DIRECT ? "direct" : "other"}`);
        return {
          $queryRaw: (async () => {
            log.push("probe");
            if (answer instanceof Error) throw answer;
            return answer;
          }) as never,
          $disconnect: async () => {
            log.push("disconnect");
          },
        };
      },
      spawn: (command, args, spawnEnv) => {
        const urls = spawnEnv.DATABASE_URL === POOLED && spawnEnv.DIRECT_URL === DIRECT ? "prod-urls" : "wrong-urls";
        log.push(`spawn:${command} ${args.join(" ")} (${urls})`);
        return 0;
      },
      ask: async () => {
        log.push("ask");
        return opts.typed ?? "";
      },
      report: (line) => lines.push(line),
    };
    return { d, log, lines };
  }

  it("status: checks the live database, then only shows migration status", async () => {
    const { d, log } = deps();
    expect(await runProductionMigrate({ mode: "status", env }, d)).toBe(0);
    expect(log).toEqual(["client:direct", "probe", "disconnect", "spawn:prisma migrate status (prod-urls)"]);
  });

  it("deploy: shows status, asks for the endpoint name, then applies migrations", async () => {
    const { d, log, lines } = deps({ typed: " ep-cool-name-123 " });
    expect(await runProductionMigrate({ mode: "deploy", env }, d)).toBe(0);
    expect(log).toEqual([
      "client:direct",
      "probe",
      "disconnect",
      "spawn:prisma migrate status (prod-urls)",
      "ask",
      "spawn:prisma migrate deploy (prod-urls)",
    ]);
    expect(lines.join("\n")).toContain("ep-cool-name-123.eu-central-1.aws.neon.tech / neondb");
    expect(lines.join("\n")).not.toContain("s3cret");
  });

  it("deploy: a wrong or empty confirmation applies nothing", async () => {
    // "neondb" is every Neon database's default name, so it must not be enough to confirm.
    for (const typed of ["", "yes", "ivo_dev", "neondb", "EP-COOL-NAME-123", "ep-cool-name-12"]) {
      const { d, log } = deps({ typed });
      expect(await runProductionMigrate({ mode: "deploy", env }, d)).toBe(1);
      expect(log.filter((l) => l.startsWith("spawn:prisma migrate deploy"))).toEqual([]);
    }
  });

  it("deploy: --confirm with the right endpoint skips the question", async () => {
    const { d, log } = deps();
    expect(await runProductionMigrate({ mode: "deploy", env, confirm: "ep-cool-name-123" }, d)).toBe(0);
    expect(log).not.toContain("ask");
    expect(log.at(-1)).toBe("spawn:prisma migrate deploy (prod-urls)");
  });

  it("runs nothing when the live server is not the database the URL names", async () => {
    for (const answer of [
      [{ database: "ivo_dev", addr: "127.0.0.1" }],
      [{ database: "neondb", addr: "127.0.0.1" }],
      [{ database: "neondb", addr: "::1" }],
      // No address means a Unix-socket connection, which is always this machine.
      [{ database: "neondb", addr: null }],
      [{ database: "neondb" }],
      [{ database: "other", addr: "3.64.10.20" }],
      [],
      new Error("timeout"),
    ]) {
      const { d, log } = deps({ answer, typed: "ep-cool-name-123" });
      expect(await runProductionMigrate({ mode: "deploy", env }, d)).toBe(1);
      expect(log.filter((l) => l.startsWith("spawn"))).toEqual([]);
    }
  });

  it("runs nothing, not even a connection, when a URL is refused", async () => {
    const { d, log } = deps({ typed: "ep-cool-name-123" });
    expect(await runProductionMigrate({ mode: "deploy", env: { PROD_DATABASE_URL: POOLED } }, d)).toBe(1);
    expect(log).toEqual([]);
  });
});
