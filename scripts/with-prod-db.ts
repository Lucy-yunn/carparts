/**
 * The ONLY way this repo reaches the production database, and only for migrations:
 *
 *   npm run db:status:prod                        which migrations are pending (read-only)
 *   npm run db:deploy:prod                        apply them, after typing the database name
 *   npm run db:deploy:prod -- --confirm <name>    the same, without the question
 *
 * The connection strings come from `.env.neon-prod.local` (git-ignored; you create it),
 * as PROD_DATABASE_URL (Neon pooled) and PROD_DIRECT_URL (Neon direct). They are read into
 * this process only and never printed. Nothing else is possible here: no reset, no seed,
 * no push. See docs/local-database.md, "Production migrations".
 */
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { PrismaClient } from "@prisma/client";
import { loadEnvFileOverriding } from "./load-env-file";
import { runProductionMigrate, type ProductionClient, type ProductionEnv } from "./prod-db-guard";

const PROD_ENV_FILE = ".env.neon-prod.local";

const [mode, ...rest] = process.argv.slice(2);
if (mode !== "status" && mode !== "deploy") {
  console.error("usage: tsx scripts/with-prod-db.ts status | deploy [--confirm <database name>]");
  process.exit(2);
}
const confirmAt = rest.indexOf("--confirm");
const confirm = confirmAt >= 0 ? (rest[confirmAt + 1] ?? "") : undefined;

// Read into its own object, so nothing else in this process picks the values up.
const fileEnv: Record<string, string | undefined> = {};
loadEnvFileOverriding(PROD_ENV_FILE, fileEnv);
const env: ProductionEnv = {
  PROD_DATABASE_URL: fileEnv.PROD_DATABASE_URL,
  PROD_DIRECT_URL: fileEnv.PROD_DIRECT_URL,
};

void runProductionMigrate(
  { mode, env, confirm },
  {
    makeClient: (url) => new PrismaClient({ datasourceUrl: url }) as unknown as ProductionClient,
    spawn: (command, args, spawnEnv) =>
      spawnSync("npx", [command, ...args], { stdio: "inherit", shell: true, env: spawnEnv }).status ?? 1,
    ask: async (question) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        return await rl.question(question);
      } finally {
        rl.close();
      }
    },
    report: (line) => console.error(line),
  },
).then((code) => process.exit(code));
