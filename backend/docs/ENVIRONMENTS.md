# Environments

How Tablz API keeps local, test, staging and production apart (ROADMAP §2, [ADR 0011](adr/0011-environment-guards.md)).

## The four environments

| `APP_ENV` | Database | API | Who changes the schema |
| --- | --- | --- | --- |
| `local` | Docker Postgres 17, `tablz_dev` on `localhost:5433` | `npm run start:dev` | you, `prisma migrate dev` |
| `test` | Docker `tablz_test` locally; a Postgres service container in CI. Reset before every run. | Jest + Supertest | automated (`migrate reset` in the e2e global setup) |
| `staging` | Supabase project `tablz-staging` | Vercel project `tablz-api-staging` (region `dub1`), deployed by the "Deploy staging" workflow after CI passes on `main` (B1201, [ADR 0028](adr/0028-vercel-deployment.md)) | CI only, `migrate deploy` (B1202) |
| `production` | Supabase project `tablz-prod` | Vercel project `tablz-api-production` (region `dub1`), deployed only by the manual "Deploy production" workflow (a commit or tag on `main`, typed confirmation) | CI only, manual workflow with typed confirmation |

## Fresh clone → working local database (two commands)

Prerequisites: Node 24 (`.nvmrc`) and Docker Desktop running. From `backend/`:

```bash
npm ci
npm run db:up
```

- **`npm ci`** installs the dependencies and generates the Prisma client.
- **`npm run db:up`** starts the `db` container and waits until it's healthy, then applies the migrations with `prisma migrate dev`.

No `.env` is needed: when there is none, `.env.example` (local values only) is used. Then `npm run start:dev` starts the API. CI runs these exact commands in the `local-setup` job.

## Guards (what refuses, and when)

| Guard | Where | Refuses |
| --- | --- | --- |
| `APP_ENV` | API boot, Prisma CLI | a missing or unknown value |
| URL vs `APP_ENV` | API boot, Prisma CLI | `local`/`test` with a non-local host (e.g. any Supabase host); `staging`/`production` with a local host |
| `app_environment` row | API boot | a row that differs from `APP_ENV`; an unmarked database under `staging`/`production` (`local`/`test` claim it) |
| Seed | `npm run db:seed` (`src/prisma/seed/seed-guard.ts`) | `APP_ENV` other than `local`/`test`, a non-local `DATABASE_URL`, or a database marked for another environment |
| Destructive commands | `prisma.config.ts` (every Prisma CLI call) | `migrate reset`, `migrate dev`, `db push`, `db seed`, `db execute` unless `APP_ENV` is `local`/`test` and `DATABASE_URL` and `DIRECT_URL` are local |

Each refusal exits with code 1 and a message that names the variable and host, never the password.

## Day-to-day database commands (from `backend/`)

| Command | What it does |
| --- | --- |
| `npm run db:up` | start the container + apply migrations |
| `npm run db:migrate -- --name <name>` | create and apply a new migration (add `--create-only` to edit SQL first) |
| `npm run db:status` | show which migrations are applied |
| `npm run db:down` | stop the container (data is kept in the `tablz-db` volume) |
| `npm run db:seed` | build, then insert the demo tenants (B401, [ADR 0016](adr/0016-demo-seed.md)). Safe to re-run: only missing rows are added, existing rows are left alone. Prints the demo guest tracking links. To get the seed back after changing data, `db:reset` then `db:seed`. |
| `npm run db:reset` | **local only:** drop and recreate `tablz_dev` from the migrations. Ask first if anyone else depends on your data. |

To wipe everything, including `tablz_test`, and start over:

```bash
docker compose down -v
```

Then `npm run db:up` again. The `-v` deletes the volume, so the init script creates `tablz_test` again.

**Port clash:** if something already uses 5433, set `DB_PORT` in `.env` and update the three URLs to match.

## Where each secret lives

| Value | local | test / CI | staging | production |
| --- | --- | --- | --- | --- |
| `APP_ENV` | `.env.example` (`local`) | CI job env (`test`) | Vercel project env | Vercel project env |
| `DATABASE_URL` (app, transaction pooler :6543) | `.env.example`, throwaway | CI job env, throwaway | Vercel project env (Production) + password manager | Vercel project env (Production) + password manager |
| `DIRECT_URL` (migrations, session pooler :5432) | `.env.example` | CI job env | GitHub environment `staging` secret `STAGING_DIRECT_URL` + password manager (CI migrations only, never in Vercel) | GitHub environment `production` secret `PROD_DIRECT_URL` + password manager |
| `CORS_ORIGINS` (not secret) | default `http://localhost:4200` | default | Vercel env: staging frontend + Vercel preview pattern | Vercel env: production frontend only |
| `LOG_LEVEL` (not secret) | default `debug` | default `silent` | default `info` | default `info` |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_SECONDS` (not secret) | default 120 per 60 s | default | default, or Vercel env | default, or Vercel env |
| Supabase DB password / project ref | — | — | password manager | password manager |
| `BACKUP_DATABASE_URL` (secret, read-only `backup` login, session pooler) | — | — | GitHub environment `staging` secret | GitHub environment `production` secret |
| `BACKUP_PASSPHRASE` (secret, encrypts every backup; losing it makes them unreadable) | — | — | GitHub environment `staging` secret + password manager | GitHub environment `production` secret + password manager |
| Vercel access token, org id, project id (secrets) | — | — | GitHub environment `staging` secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (the staging project) | GitHub environment `production` secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (the production project) |
| API base URL (not secret) | — | — | GitHub environment variable `STAGING_API_URL` | GitHub environment variable `PRODUCTION_API_URL` |
| `DEPLOY_COMMIT` (not secret) | unset (`/v1/health` reports `commit: null`) | unset | set on each deployment by the deploy workflow | set on each deployment by the deploy workflow |
| `DATABASE_POOL_MAX` (not secret) | default 10 | default | Vercel env, e.g. `3` (many function instances share the pooler) | Vercel env, e.g. `3` |

Rules:

- Only `.env.example` is committed. Every other `.env*` is gitignored.
- A deployed service (`APP_ENV` already `staging` or `production`) reads no env file, so every variable must be set in its Vercel project ([ADR 0028](adr/0028-vercel-deployment.md)).
- Staging and production values never sit in a file on a developer machine, and are never pasted into a chat or an issue.
- Staging and production have different passwords and project refs.

## Supabase notes

- **Postgres major version:** the compose file and the CI service container use `postgres:17` to match Supabase. If the dashboard shows a different major version, change both to match.
- **IPv4:** GitHub's runners are IPv4-only. On the free plan the direct host `db.<ref>.supabase.co` is IPv6-only, so CI must use the **session pooler** string for `DIRECT_URL`. The app uses the **transaction pooler** (`:6543`).
- **Marker row:** a new staging or production database has no `app_environment` row and the API refuses to boot until CI inserts it: `npm run db:deploy` in the deploy workflows (B1202, [ADR 0029](adr/0029-migration-workflows.md)). A failed migration blocks later deploys until the "Resolve failed migration" workflow is run. See ADR 0011.

Status of the Supabase setup (B201 manual steps, done 2026-11-06):

| Item | Value |
| --- | --- |
| `tablz-prod` created | ✅ |
| `tablz-staging` created | ✅ |
| Postgres major version (dashboard) | ✅ 17 (matches compose and CI) |
| Session pooler reachable from a GitHub runner | ✅ confirmed by the user, 2026-11-06 |
