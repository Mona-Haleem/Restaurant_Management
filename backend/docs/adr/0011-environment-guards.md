# ADR 0011 — Environment guards and connection strings

- **Status:** accepted
- **Date:** 2026-11-06
- **Answers:** — · **Tickets:** B201, B401, B1202

## Context

ROADMAP §2 requires an `app_environment` boot guard, destructive-command guards (`migrate reset`, seed, truncate) that only run on `local`/`test`, and a `DATABASE_URL` / `DIRECT_URL` split that works from GitHub's IPv4 runners. B201 comes before the schema ticket (B301) and the config module (B501), so the guards need a home that doesn't depend on either.

## Options considered

1. **URL check only** — refuse remote hosts when `APP_ENV` is local/test. Needs no database, but a pasted production URL can still be used if its host happens to pass, and it doesn't meet the roadmap's `app_environment` requirement.
2. **Wrapper npm scripts** (`npm run db:reset` checks, then calls Prisma) — easy, but a raw `npx prisma migrate reset` skips the check.
3. **Guards in shared pure functions, enforced at two choke points** — `main.ts` before Nest starts, and `prisma.config.ts`, which every Prisma CLI command loads before it connects. Also an `app_environment` marker row in the database itself.

## Decision

Option 3.

- **Boot:** `APP_ENV` must be valid. In local/test, `DATABASE_URL` must point at a local host (`localhost`, `127.0.0.1`, `::1`, `db`, `postgres`); in staging/production it must not. The single `app_environment` row must equal `APP_ENV`.
  - An unmarked database is claimed automatically only by local/test.
  - Staging/production must be marked by the CI migration workflow (B1202) and otherwise refuse to boot.
- **Prisma CLI:** `migrate reset`, `migrate dev`, `db push`, `db seed` and `db execute` run only when `APP_ENV` is local/test **and** both `DATABASE_URL` and `DIRECT_URL` are local. `migrate deploy`, `status`, `generate` and `validate` are not guarded, because CI needs them.
- **Messages** name the variable and host, never the credentials.
- **Connection strings:** the app uses `DATABASE_URL`; the Prisma CLI uses `DIRECT_URL`, falling back to `DATABASE_URL`.
  - Staging/production: `DATABASE_URL` is the Supabase **transaction pooler** (port 6543); `DIRECT_URL` is the **session pooler** (port 5432).
  - Both pooler hosts are IPv4. The direct `db.<ref>.supabase.co` host is IPv6-only on the free plan, so GitHub runners can't reach it. This is still to be verified in the dashboard (B201 👤 checklist).
- **Env files:** loaded with Node's built-in parser, `.env` first, else `.env.example`. Already-set variables always win, so CI and host values can never be overridden by a file. When `APP_ENV` is already `staging` or `production`, no file is read at all ([ADR 0028](0028-vercel-deployment.md)).

## Consequences

- Prisma arrives in B201 with one table (`app_environment`). B301 adds the business tables as the second migration.
- The B401 seed must call `assertPrismaCommandAllowed` (or the same `isDisposableEnv` check) before writing. `prisma db seed` is already guarded by the config.
- B1202's staging/production migration step (`npm run db:deploy`, [ADR 0029](0029-migration-workflows.md)) inserts the marker row once per database, never overwriting one, and refuses a database marked for another environment before migrating it.
- B503's PrismaService can reuse `prismaMarkerStore` and replace the short-lived boot client.
- Adding a new local host name (e.g. a different compose service name) means updating `LOCAL_HOSTS` in `src/config/environment.ts`.
