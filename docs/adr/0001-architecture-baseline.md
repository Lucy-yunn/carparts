# ADR-0001 — Architecture baseline (v1 tech stack)

- **Status:** accepted
- **Date:** 2026-09-05 (drafted, research #6) · 2026-09-07 (finalised, #26 Final spec assembly)
- **Deciders:** founder + reviewing developer
- **Sources:** [#6 Tech stack & architecture baseline](https://github.com/Lucy-yunn/carparts/issues/6) · research: `docs/research/tech-stack-baseline.md` (branch `research/tech-stack-baseline`)
- **Amends:** the proposed draft's "Auth.js (NextAuth v5)" line → **Better Auth** (settled by [#12](https://github.com/Lucy-yunn/carparts/issues/12)); its S3/UploadThing photo-store line → **Vercel Blob**; removes the `Fitment` many-to-many from the domain sketch ([#21](https://github.com/Lucy-yunn/carparts/issues/21) — v1 has no `Fitment`).

## Context

A Part-centric used automotive parts marketplace MVP. v1 is a **functional demo with seed data and no real payments** (Q3), built by a solo founder with Claude Code, reviewed and sometimes edited by a second developer. Optimise for development speed and low ops burden without blocking the known roadmap (more sellers, multi-country, real payments). English UI with a language toggle scaffolded from day one (Bulgarian later); EUR only.

The repo is a **modified Next.js `16.3.4`** scaffold. `AGENTS.md` warns that APIs and conventions differ from model training data; the version-matched docs at `node_modules/next/dist/docs/` are the source of truth. Material breaking changes: async-only request APIs (`cookies`/`headers`/`params`/`searchParams`); `middleware` → **`proxy`** (Node-runtime only); **Turbopack** default (a custom `webpack` config breaks `next build`); `next lint` removed; `next/image` `images.domains` → `remotePatterns`; PPR/`dynamicIO`/`useCache` replaced by the opt-in `cacheComponents` model; Node 20.9+, React 19.2.

## Decision

### Framework & rendering
- **Next.js 16 App Router.** All routes under **`app/[locale]/…`**; `locale` read via `next/root-params`, `generateStaticParams` returns `['en']`.
- **Server Components by default** for reads, fetched through a **Data Access Layer (DAL)**: `verifySession()` → memoised `cache()` → return DTOs. **Auth checks live in the DAL and in every Server Action — never in layouts.**
- **Server Actions** for every mutation (registration, auth, favourites, messaging, the stubbed order, all staff admin actions); each re-checks auth + role internally. `useActionState` for pending/errors; `revalidatePath` / `redirect` after writes.
- **Route Handlers** (`app/api/**`) only for a health check in v1; reserved for future webhooks.
- Request-time dynamic rendering for authed / DB-backed pages; `<Suspense>` + `loading.tsx` for streaming; static only for marketing/legal pages. **`cacheComponents` and React Compiler stay off for v1.**
- **`proxy.ts`** (Node runtime): locale resolution + *optimistic* cookie-only auth redirects for `/account`, `/seller`, `/admin` — a UX shortcut, **not** a security boundary (the DAL is).
- `next.config.ts` stays minimal — no `webpack` fn; near-term additions are `images.remotePatterns` and i18n wiring.

### Database & ORM
- **PostgreSQL** on **Neon** (managed, connection pooling), accessed via **Prisma** (`schema.prisma`, `prisma migrate`, `prisma db seed`).
- The domain is relational — `Category → Part → Listing`, the `Make → VehicleModelGroup → VehicleGeneration` catalogue, `Listing → DonorVehicle` provenance, single-item `Order` state machine, `Thread`/`Message`, `Notification`. Postgres adds `jsonb` (the per-Category `Part.attributes`), `enum`, and full-text-search headroom.
- Serverless deployment **must** use pooled connections (Neon pooler).
- The concrete schema is owned by [`docs/domain-model.md`](../domain-model.md) and the topic docs, not this ADR.

### Auth
- **Better Auth** — email + password, Prisma adapter, session in an `httpOnly` / `secure` / `sameSite=lax` cookie, verified in the DAL. Full configuration, flows and the permission matrix: [`docs/auth-and-permissions.md`](../auth-and-permissions.md) and [ADR-0004](./0004-one-role-per-user.md).
- The Better Auth **`admin` plugin** for staff-managed users; its access-control roles are plugin wiring only — **all application authorization is in the DAL** (role guards + ownership checks), not Better Auth ACL.
- `role` enum on `User` (`buyer | seller | staff`), one per `User` ([ADR-0004](./0004-one-role-per-user.md)). Google / Facebook buttons rendered **disabled**.
- **No transactional email in v1** — staff-relayed password reset, no "forgot password" link ([`docs/auth-and-permissions.md`](../auth-and-permissions.md) §6, [ADR-0008](./0008-in-app-notifications-email-deferred.md)).

### Photo storage
- **Vercel Blob** behind a thin `lib/storage.ts` abstraction; the database stores **URL + metadata only**. Rendered via `next/image` with an `images.remotePatterns` allow-list.
- Only the **curated** photo set enters Blob (staff select/downscale on ingest); raw seller dumps stay in a shared drive and are never migrated ([`docs/seller-intake.md`](../seller-intake.md) §4, [ADR-0007](./0007-staff-entry-no-submission-entity.md)). No listing photos in `public/` or the repo.
- Upload goes through a Server Action, not direct browser-to-Blob, so `sharp` sees every photo. To fit the host's 4.5 MB request cap, the browser shrinks each photo first and the upload limit is 4 MB (issue #37).

### i18n
- **next-intl** with the `app/[locale]` segment: server-side message catalogs, ICU messages, EUR/number/date formatting, a ready-made locale switcher. All UI copy authored as message keys from the first screen. EN is the only fully-translated locale in v1; `bg` (and later `nl`/`de`/`fr`/`ro`) are scaffolded — adding one later is one messages file + one locale-array entry. Non-English selection shows a "not translated yet" notice and reverts.

### Hosting
- **Vercel** for v1 (verified adapter, zero-config, per-branch preview deploys), with Neon as the managed Postgres. Keep the app portable — standard Node semantics, `output: 'standalone'`, no Vercel-only APIs — so a later move to a plain Node host is cheap. The one scheduled job (cancellation auto-approve, [`docs/order-model.md`](../order-model.md) §6.5) runs as a **Vercel Cron**.

### Supporting choices
pnpm · TypeScript `strict` + `next typegen` in CI · Tailwind CSS v4 (scaffolded) · Zod for validation (shared client/server schemas) · ESLint flat config via its own CLI · Vitest + a light Playwright suite · Node 20.9+ · configuration via env vars only.

## Consequences

**Positive**
- One language and runtime (TypeScript / Node) end to end; every layer has first-class Next.js 16 support and heavy Claude-Code training coverage.
- Server Components + Server Actions remove the need for a separate API layer in v1.
- Relational Postgres models the `Part` / `Listing` / provenance separation directly and leaves search / multi-country / payments headroom.
- Portable by construction: ORM, auth library, photo store and host are each a contained swap.

**Negative / risks**
- Modified Next.js 16: assistant-generated code from memory will be wrong on async request APIs, `proxy`, image config and caching. **Mitigation:** always read `node_modules/next/dist/docs/`; the research doc's change checklist is the reference.
- Serverless + Prisma needs connection pooling configured from the start.
- next-intl and Better Auth are external deps whose own docs must be read (not in the bundled Next docs).
- `cacheComponents` deliberately deferred — revisit once the read model and traffic shape are known.

## Alternatives considered

| Area | Chosen | Rejected | Why |
|---|---|---|---|
| ORM | Prisma | Drizzle | Prisma has the most Claude-Code examples and easy migrations; Drizzle's lighter runtime doesn't matter at demo scale. |
| Auth | Better Auth | Auth.js v5 | Better Auth's email/password + role/provisioning + `admin` plugin fit the 3-role staff-provisioned model far better ([#12](https://github.com/Lucy-yunn/carparts/issues/12)). |
| Host + DB | Vercel + Neon | Railway/Render/Fly + bundled Postgres | Lowest ops for a solo builder; the pooling requirement is a one-time setup. |
| Photo store | Vercel Blob | S3 / UploadThing / R2 | One vendor, zero extra setup on Vercel, behind an abstraction so it's swappable; demo photo volume is tiny. |
| i18n | next-intl | zero-dep dictionary | Batteries included (formatting, switcher, ICU); the toggle must exist from day one. |
