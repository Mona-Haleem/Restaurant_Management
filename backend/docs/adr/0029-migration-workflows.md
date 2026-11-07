# ADR 0029 — Migrations in the deploy workflows

- **Status:** accepted
- **Date:** 2026-11-07
- **Answers:** ADR 0011 (CI marks staging/production), ADR 0028 consequence · **Tickets:** B1202 (demo reset → B1205)

## Context

ROADMAP B1202: staging runs `migrate deploy` on merge, before the app deploys; production runs it from the manual workflow with a typed confirmation; a failed migration stops the deploy. Quality guideline: migrations stay backward-compatible for one release, because the old code runs briefly against the new schema. Acceptance: a deliberately broken migration on staging blocks the deploy and leaves the previous version running.

Three more constraints apply:
- **ADR 0011:** a staging or production database has no `app_environment` marker until CI writes one, and the API refuses to boot until then.
- **CLAUDE.md rule 6:** migrations against staging and production run only from CI.
- **Prisma's failure handling:** after a failed migration, Prisma refuses every later `migrate deploy` (P3009) until someone runs `prisma migrate resolve`.

## Decision

- **`npm run db:deploy`** (`src/deploy/run-db-deploy.ts`, decisions in the pure `deployDatabase`), staging and production only:
  1. **Check first.** Read the database's marker through `DIRECT_URL`. A marker for another environment (e.g. the production URL in the staging secret) stops the step before anything is migrated. No table or no row means a fresh database.
  2. **Migrate.** `prisma migrate deploy` runs through the CLI, so `prisma.config.ts` applies.
  3. **Mark.** Claim the marker on a fresh database (insert, never overwrite), then confirm that it matches.
- **Both deploy workflows** run it as the step right after checking out the exact commit and before `vercel build`. The step has no `continue-on-error`, so any failure ends the job: nothing is built or deployed, and the previous deployment keeps serving. The rollback step only follows a deploy that actually ran.
- **Credentials:** `DIRECT_URL` (the session pooler) is a GitHub environment secret, `STAGING_DIRECT_URL` or `PROD_DIRECT_URL`. It is given to that one step only, never to the build or to the functions (ADR 0028). Staging skips with a notice until it exists.
- **"Resolve failed migration"** (`migrate-resolve.yml`) is a manual workflow.
  - Inputs: environment, migration folder, `rolled-back` or `applied`, and a typed `resolve <environment>`.
  - It runs `prisma migrate resolve` from CI.
- **Backward compatibility:** `src/prisma/migration-safety.spec.ts` fails on a migration newer than `20261107082240_b1101_history_stage_time_idx` that drops anything (except `DROP NOT NULL`), renames, changes a column type, makes a column required, adds a required column without a default, or removes rows. The exception is a migration starting with `-- contract step: <why>`, the "remove" half of an expand/contract change, shipped one release after the code stopped using what it removes.
- **Scope:** the demo-tenant reset and the scheduled staging reseed (ADR 0017) are split into **B1205**. They need changes to the seed guards and are not in the roadmap's B1202 text.

## Consequences

- **Proof:**
  - Locally: `test/migrate-deploy.e2e-spec.ts` runs a deliberately broken migration against the test database. It shows that the command fails, that the migration is recorded as failed, and that later deploys keep refusing.
  - The workflow order is checked by `src/deploy/deploy-config.spec.ts`.
  - The live drill on staging is in the checklist.
- **No automatic rollback of the schema.** Prisma does not wrap a migration in a transaction, so a migration that fails halfway can leave part of its changes. Keep migrations small, and use the resolve workflow after fixing the data by hand.
- **Expand/contract** means two PRs one release apart (add, switch the code, then remove), not one.

## Checklist (🤝 your account steps)

1. **GitHub → Settings → Environments:**
   - in `staging`, add the secret **`STAGING_DIRECT_URL`**: the **session pooler (port 5432)** string of Supabase `tablz-staging`, with its password;
   - in `production`, add **`PROD_DIRECT_URL`**: the same for `tablz-prod`.
2. **Then the Vercel secrets** (ADR 0028 checklist step 7). The first "Deploy staging" after that migrates the empty staging database, marks it `staging` and deploys.
3. **Check the first claim.** Two fresh databases can't tell which is which, so a swapped secret would let staging claim the production database. After the first staging deploy:
   - in the Supabase SQL editor of **`tablz-staging`**, run `SELECT name FROM app_environment;`;
   - it must say `staging`, and `tablz-prod` must still have no row.
4. **Production's first deploy:** run "Deploy production" from branch `main`, with a commit on `main`. It migrates and marks `tablz-prod` the same way. Afterwards `tablz-prod` must say `production`.
5. **Optional live drill** of the acceptance ("a broken migration on staging blocks the deploy and leaves the previous version running"):
   - **Why not just a broken migration:** CI would fail first, because its integration tests apply every migration to a fresh test database. The deploy would never start, and the broken migration would have to be deleted, which rule 6 forbids.
   - **Instead,** merge a PR with a new migration (`npx prisma migrate dev --create-only --name b1202_drill`) that is a no-op everywhere except on a marked staging or production database:

     ```sql
     DO $$ BEGIN
       IF EXISTS (SELECT 1 FROM "app_environment" WHERE "name" IN ('staging', 'production')) THEN
         RAISE EXCEPTION 'B1202 drill: this migration fails on purpose on deployed databases';
       END IF;
     END $$;
     ```
   - CI passes, then "Deploy staging" fails at "Migrate and mark the staging database". `<staging>/v1/health` still shows the previous commit.
   - **Recover:** run "Resolve failed migration" from `main` (environment `staging`, that migration's folder name, **`applied`**, confirmation `resolve staging`). The block changed nothing, so recording it as applied is correct. Then re-run "Deploy staging" or merge the next PR.
   - **Before production next deploys any commit that includes the drill,** resolve it on production the same way, with environment `production` and confirmation `resolve production`. Otherwise the production deploy fails at the database step too, which is safe but noisy. Nothing is deleted; the drill migration stays in the history.
