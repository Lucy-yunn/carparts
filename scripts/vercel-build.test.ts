import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runVercelBuild, type VercelBuildDeps } from "./vercel-build";

const PROD_POOLED = "postgresql://app:pw@ep-prod-pooler.example.neon.tech/neondb";
const PROD_DIRECT = "postgresql://app:pw@ep-prod.example.neon.tech/neondb";

/** Records every command and message instead of running anything. */
function deps(statuses: Record<string, number> = {}) {
  const log: string[] = [];
  const d: VercelBuildDeps = {
    spawn: (command, args) => {
      const line = `${command} ${args.join(" ")}`;
      log.push(`spawn:${line}`);
      return statuses[line] ?? 0;
    },
    report: (line) => log.push(`report:${line}`),
  };
  return { d, log, spawned: () => log.filter((l) => l.startsWith("spawn:")) };
}

const production = { VERCEL: "1", VERCEL_ENV: "production", DATABASE_URL: PROD_POOLED, DIRECT_URL: PROD_DIRECT };

describe("runVercelBuild: migrations run on Vercel Production only, then next build", () => {
  it("on a Production deployment, applies pending migrations and then builds", () => {
    const { d, spawned } = deps();
    expect(runVercelBuild(production, d)).toBe(0);
    expect(spawned()).toEqual(["spawn:prisma migrate deploy", "spawn:next build"]);
  });

  it("on a Preview deployment, only builds (no migration)", () => {
    const { d, spawned } = deps();
    expect(runVercelBuild({ ...production, VERCEL_ENV: "preview" }, d)).toBe(0);
    expect(spawned()).toEqual(["spawn:next build"]);
  });

  it("outside Vercel, only builds, even if VERCEL_ENV says production", () => {
    for (const env of [
      { ...production, VERCEL: undefined },
      { ...production, VERCEL_ENV: undefined },
      { ...production, VERCEL_ENV: "development" },
    ]) {
      const { d, spawned } = deps();
      expect(runVercelBuild(env, d)).toBe(0);
      expect(spawned()).toEqual(["spawn:next build"]);
    }
  });

  it("does not build when the migration fails", () => {
    const { d, spawned } = deps({ "prisma migrate deploy": 1 });
    expect(runVercelBuild(production, d)).toBe(1);
    expect(spawned()).toEqual(["spawn:prisma migrate deploy"]);
  });

  it("returns the build's failure", () => {
    const { d } = deps({ "next build": 1 });
    expect(runVercelBuild(production, d)).toBe(1);
  });

  it("on Production, refuses before running anything when a connection string is missing or malformed", () => {
    for (const env of [
      { ...production, DIRECT_URL: undefined },
      { ...production, DIRECT_URL: "  " },
      { ...production, DATABASE_URL: undefined },
      { ...production, DIRECT_URL: PROD_DIRECT + PROD_DIRECT },
    ]) {
      const { d, log, spawned } = deps();
      expect(runVercelBuild(env, d)).toBe(1);
      expect(spawned()).toEqual([]);
      // The message names the variable but never echoes a connection string.
      expect(log.join("\n")).not.toMatch(/postgres(ql)?:\/\//);
    }
  });

  it("never resets, pushes or seeds", () => {
    const { d, spawned } = deps();
    runVercelBuild(production, d);
    expect(spawned().join("\n")).not.toMatch(/reset|db push|db seed|seed/);
  });
});

describe("wiring: Vercel builds through scripts/vercel-build.ts", () => {
  const scripts: Record<string, string> = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));

  it("vercel.json runs the vercel-build script", () => {
    expect(vercel.buildCommand).toBe("npm run vercel-build");
  });

  it("the vercel-build script runs scripts/vercel-build.ts", () => {
    expect(scripts["vercel-build"]).toBe("tsx scripts/vercel-build.ts");
  });

  it("the plain build script stays a plain next build", () => {
    expect(scripts.build).toBe("next build");
  });
});
