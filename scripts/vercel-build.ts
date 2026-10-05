import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { assertPostgresUrl } from "../lib/connection-string";

/**
 * Vercel's build command (vercel.json → `npm run vercel-build`).
 *
 * On a Vercel Production deployment it applies pending migrations with
 * `prisma migrate deploy` (via DIRECT_URL), then runs `next build`. Everywhere
 * else, Preview included, it only runs `next build`: Preview never migrates.
 *
 * `migrate deploy` only applies migrations that are not yet recorded; it never
 * resets, pushes or seeds. If it fails, the build does not run, so a failed
 * migration fails the deployment instead of shipping code against an old schema.
 *
 * This is the one place production migrations run (docs/local-database.md);
 * the local-only guards in with-dev-db.ts / with-test-db.ts do not apply here.
 * Messages never contain a connection string.
 */
export interface VercelBuildEnv {
  VERCEL?: string;
  VERCEL_ENV?: string;
  DATABASE_URL?: string;
  DIRECT_URL?: string;
}

export interface VercelBuildDeps {
  spawn: (command: string, args: string[]) => number;
  report: (line: string) => void;
}

const defaultDeps: VercelBuildDeps = {
  spawn: (command, args) => spawnSync(command, args, { stdio: "inherit", shell: true }).status ?? 1,
  report: (line) => console.error(line),
};

export function runVercelBuild(env: VercelBuildEnv, deps: VercelBuildDeps = defaultDeps): number {
  const isProduction = env.VERCEL === "1" && env.VERCEL_ENV === "production";

  if (isProduction) {
    try {
      assertPostgresUrl("DATABASE_URL", env.DATABASE_URL);
      assertPostgresUrl("DIRECT_URL", env.DIRECT_URL);
    } catch (err) {
      deps.report(`\n✖ Production build stopped before migrating: ${(err as Error).message}\n`);
      return 1;
    }

    deps.report("▸ Vercel Production: applying pending migrations (prisma migrate deploy)");
    const migrated = deps.spawn("prisma", ["migrate", "deploy"]);
    if (migrated !== 0) {
      deps.report("\n✖ prisma migrate deploy failed, so next build was not run.\n");
      return migrated;
    }
  } else {
    deps.report(`▸ Not a Vercel Production build (VERCEL_ENV=${env.VERCEL_ENV ?? "unset"}): skipping migrations`);
  }

  return deps.spawn("next", ["build"]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { VERCEL, VERCEL_ENV, DATABASE_URL, DIRECT_URL } = process.env;
  process.exit(runVercelBuild({ VERCEL, VERCEL_ENV, DATABASE_URL, DIRECT_URL }));
}
