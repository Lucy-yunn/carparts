# Local database workflow

Development and automated tests run against a **PostgreSQL 18 installed on this machine**, in two separate databases:

| Database | Used by | Reached with |
|---|---|---|
| `ivo_dev` | `npm run dev`, `db:migrate`, `db:deploy`, `db:seed` | `.env.local` |
| `ivo_test` | `npm run test:integration`, `db:migrate:test`, `db:seed:test` | `.env.test.local` |

The Neon databases are **not part of this workflow** and are never touched by it. Production settings live in Vercel. The one exception is applying migrations to production, which has its own command and its own guard (see [Production migrations](#production-migrations)).

## Why local

A query to the Neon database in Frankfurt took about 0.47 seconds from the developer's machine, so pages took several seconds and a full test run took many minutes. A local database answers in about a millisecond.

## The safety rules

Every command that can change or wipe data goes through `scripts/local-db-guard.ts` first. There is **no override, flag or environment variable** that allows a remote database.

1. **The address is checked.** The host must be exactly `localhost` or `127.0.0.1`, the database name must be exactly `ivo_dev` (development) or `ivo_test` (tests), and no query parameter may redirect the connection (`host`, `hostaddr`, `dbname`, `port`, `service`, and so on). Anything mentioning `neon.tech` is refused.
2. **The live server is asked.** Before the command runs, the server reports its own database name and the address it answered from. The name must match and the address must be a loopback address. This catches a name that resolves somewhere unexpected.
3. **It fails closed.** If the question cannot be answered, the command does not run.
4. **Messages are safe to share.** Errors never contain the URL, the host or the password.

| Command | Guard |
|---|---|
| `npm run test:integration` | `vitest.integration.setup.ts`: URL check, then the live check, before any test file runs |
| `npm run db:migrate:test`, `npm run db:seed:test` | `scripts/with-test-db.ts` |
| `npm run db:migrate`, `npm run db:deploy`, `npm run db:seed` | `scripts/with-dev-db.ts` |
| the seed itself | `seedDatabase` asks the live connection before it wipes any table |

`scripts/package-scripts.test.ts` fails if a script that runs `prisma migrate`, `prisma db seed` or `prisma db push` is added without going through these wrappers.

### What is deliberately not guarded

- `npm run dev` and the running app read `DATABASE_URL` but only query. Pointing them at Neon is possible and harmless to data.
- `npm run db:studio` opens whatever `.env.local` points at. It can edit rows by hand, so look at which database it is showing.
- `npm run db:seed:staff` upserts the staff accounts and is meant to be usable against production later, so it is not restricted to local.
- `npm run db:generate` and `postinstall` (`prisma generate`) never connect.

## Setting it up

Run these yourself, in an interactive terminal (PowerShell or Windows Terminal), from the project folder. Each step tells you what it did and never prints a password.

1. **Install PostgreSQL 18** and create the two databases `ivo_dev` and `ivo_test` (the service listens on `localhost:5432`).
2. **Back up the current settings:** `npx tsx scripts/setup-local-db.ts backup`. This copies `.env.local` to `.env.neon-dev.local` and `.env.test.local` to `.env.neon-test.local`. Both are ignored by git, and an existing backup is never overwritten.
3. **Write the local settings:** `npx tsx scripts/setup-local-db.ts configure`. It asks for the user name and port (defaults `postgres` and `5432`) and for the password at a hidden prompt, twice, and refuses if the two differ. Typing is invisible, so pasting the password works too. It changes only `DATABASE_URL` and `DIRECT_URL` in `.env.local` and `TEST_DATABASE_URL` and `TEST_DIRECT_URL` in `.env.test.local`. Every other line is left as it was.
4. **Check both databases answer:** `npx tsx scripts/setup-local-db.ts check`. It reads only and reports how many tables each database has.
5. **Create the tables:** `npm run db:deploy`, then `npm run db:migrate:test`.
6. **Load the demo data and staff accounts:** `npm run db:seed`, then `npm run db:seed:staff`.
7. **Run the tests:** `npm run test:integration`.

To go back to the Neon settings: `npx tsx scripts/setup-local-db.ts restore --yes`. Migrations, seeds and tests will still refuse a remote database after that, so a restored configuration is only for running the app.

## Troubleshooting

**`check` says "Could not confirm which database is connected".** The message is deliberately vague. Read the server side: PostgreSQL logs every failed login in `C:\Program Files\PostgreSQL\18\data\log\`. "password authentication failed" means the password in `.env.local` is not the one PostgreSQL has.

**The password is lost or typing it keeps failing.** On a Windows machine with a Chinese input method, a typed password can silently differ from the one that was set. Instead of typing, let the machine generate one and set it, which needs an administrator PowerShell and only touches this local PostgreSQL:

1. Back up `C:\Program Files\PostgreSQL\18\data\pg_hba.conf`.
2. Temporarily change the two `host all all` lines for `127.0.0.1/32` and `::1/128` from `scram-sha-256` to `trust`, and restart the service `postgresql-x64-18`.
3. Run `ALTER ROLE postgres WITH PASSWORD '<a random 24 character letters and digits string>'` through `psql`, keeping the password only in a PowerShell variable and the clipboard.
4. In a `finally` block, always restore `pg_hba.conf` from the backup and restart the service, then log in once with the new password to prove it works.
5. Paste the clipboard into `setup-local-db.ts configure`, then clear the clipboard with `Set-Clipboard -Value $null`.

The local databases hold only seed data, so nothing is lost by resetting.

**Pages return 404 or old data after switching to the local database.** A dev server that was already running keeps its old database client even after `.env.local` changes. Stop it and start `npm run dev` again, and make sure only one server is listening on port 3000.

**A script ignores `.env.local`.** Importing `@prisma/client` copies `.env`, which holds a placeholder address, into the environment first, and `process.loadEnvFile` never overwrites an existing variable. The database scripts load their files with `loadEnvFileOverriding` instead, and `scripts/env-loading.test.ts` fails if one goes back to `process.loadEnvFile`.

## Measured difference

| | Neon in Frankfurt | Local PostgreSQL |
|---|---|---|
| One simple query | about 470 ms | under 1 ms |
| Seller profile page | 4 to 21 seconds | about 0.5 seconds |
| Full integration suite (147 tests) | many minutes | about 21 seconds |

## Things to know

- The local databases start empty. The demo data is rebuilt by the seed, not copied from Neon.
- The same password is used for both databases. It is only for this machine, so choose one you do not use anywhere else.
- Tests create and delete their own tagged rows. `db:seed:test` wipes `ivo_test` completely, which is fine because it is throwaway.
- Production migrations run from this machine only through `db:status:prod` / `db:deploy:prod`, never as part of the Vercel build (a Preview deploy must never change production).

## Production migrations

`scripts/with-prod-db.ts` is the only way this repo reaches the production database, and it can only run `prisma migrate status` and `prisma migrate deploy`. It cannot reset, seed or push.

1. Create `.env.neon-prod.local` in the repo root yourself (git-ignored by `.env*`). Paste each value once:

   ```
   PROD_DATABASE_URL="<Neon production, pooled connection string>"
   PROD_DIRECT_URL="<Neon production, direct connection string (host without -pooler)>"
   ```

   The names start with `PROD_` on purpose: Next.js, Prisma and the local guards never read them, so this file cannot redirect `npm run dev` or the tests.
2. `npm run db:status:prod` shows the production host / database and which migrations are pending. It changes nothing.
3. `npm run db:deploy:prod` does the same, then asks you to type the database name. Only an exact match applies the pending migrations. `npm run db:deploy:prod -- --confirm <name>` gives the name up front.

Checks, in order (`scripts/prod-db-guard.ts`); nothing runs unless every one passes:

- both values are set, each a single PostgreSQL connection string;
- neither points at this machine (`localhost`, `127.0.0.1`, `::1`) or names `ivo_dev` / `ivo_test`;
- the direct value is not a pooled address, and both name the same database;
- the live server confirms it is that database and is not on this machine.

Messages show the host and database name, never the password. Run it after merging a PR that adds a migration, before or right after that code deploys.
