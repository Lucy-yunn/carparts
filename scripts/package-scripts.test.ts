import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A wiring test: every npm script that can change or wipe a database must go through the
 * guard wrappers. If someone adds or edits a script and bypasses them, this fails.
 */
const scripts: Record<string, string> = JSON.parse(readFileSync("package.json", "utf8")).scripts;

const DEV_GUARDED = ["db:migrate", "db:deploy", "db:seed"];
const TEST_GUARDED = ["db:migrate:test", "db:seed:test"];

describe("package.json: destructive database scripts go through the local-only guards", () => {
  it.each(DEV_GUARDED)("%s runs through scripts/with-dev-db.ts", (name) => {
    expect(scripts[name], `${name} is missing`).toBeDefined();
    expect(scripts[name]).toMatch(/^tsx scripts\/with-dev-db\.ts prisma /);
  });

  it.each(TEST_GUARDED)("%s runs through scripts/with-test-db.ts", (name) => {
    expect(scripts[name], `${name} is missing`).toBeDefined();
    expect(scripts[name]).toMatch(/^tsx scripts\/with-test-db\.ts prisma /);
  });

  it("no script runs prisma migrate, db seed, db push or migrate reset directly", () => {
    const risky = /prisma\s+(migrate|db\s+seed|db\s+push|migrate\s+reset)/;
    const unguarded = Object.entries(scripts).filter(
      ([, cmd]) => risky.test(cmd) && !/scripts\/with-(dev|test)-db\.ts/.test(cmd),
    );
    expect(unguarded.map(([name]) => name)).toEqual([]);
  });

  it("production is reached only through scripts/with-prod-db.ts, which picks the prisma command itself", () => {
    expect(scripts["db:deploy:prod"]).toBe("tsx scripts/with-prod-db.ts deploy");
    expect(scripts["db:status:prod"]).toBe("tsx scripts/with-prod-db.ts status");
    const prodScripts = Object.entries(scripts).filter(([, cmd]) => cmd.includes("with-prod-db"));
    expect(prodScripts.map(([name]) => name).sort()).toEqual(["db:deploy:prod", "db:status:prod"]);
  });

  it("no script loads .env.local straight into a prisma command", () => {
    const bypass = Object.entries(scripts).filter(([, cmd]) => /dotenv\s+-e\s+\.env\.local\s+--\s+prisma\s+(migrate|db\s+seed|db\s+push)/.test(cmd));
    expect(bypass.map(([name]) => name)).toEqual([]);
  });
});
