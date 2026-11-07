# ADR 0027 — Render deployment

- **Status:** superseded by [ADR 0028](0028-vercel-deployment.md) (Render asked for payment details; the API moved to Vercel)
- **Date:** 2026-11-07
- **Answers:** ROADMAP §2 (staging deploys on merge, production manual) · **Tickets:** B1201 (then B1202, B1203)

## Context

ROADMAP B1201 asks for two Render services (staging and production), each with a health check and its environment variables set in the dashboard, deploying only after CI passes. Acceptance:
- a merge to `main` updates staging with no manual step;
- production changes only through the manual workflow.

Three constraints shape the design:
- **B1202:** it must run `migrate deploy` before the app deploys, and a failed migration must stop the deploy. The trigger therefore has to live in GitHub Actions, not in Render.
- **ADR 0011:** the API refuses to boot on a staging or production database until B1202 has written the `app_environment` marker row.
- **ENVIRONMENTS.md:** it said production deploys "from a release tag", but the roadmap ("manual workflow") wins.

## Options considered

1. **Render auto-deploy ("after CI checks pass").** No workflow needed, but Render would deploy before, or without, B1202's migrations.
2. **Render auto-deploy off; GitHub workflows call each service's deploy hook for an exact commit.** One place orders migrate → deploy → verify; production has a typed confirmation.

## Decision

Option 2.

- **`render.yaml` (Blueprint):** two `web` services, `tablz-api-staging` and `tablz-api-production`.
  - Both: `rootDir: backend`, `npm ci --include=dev && npm run build`, `npm start`, health check `/v1/health`, `autoDeployTrigger: off`, free plan, Frankfurt region.
  - Variables: `APP_ENV` per service and `NODE_VERSION` (= `.nvmrc`). `DATABASE_URL`, `DIRECT_URL` and `CORS_ORIGINS` are `sync: false`: typed in the dashboard, never committed.
- **`deploy-staging.yml`:**
  - Runs when the `CI` workflow completes successfully for a **push** to `main`.
  - Calls `RENDER_STAGING_DEPLOY_HOOK` with `ref=<that commit>`.
  - Polls `/v1/health` until it reports the commit (about 20 minutes at most), skipping a commit that is no longer the tip of `main`.
  - Until the hook secret exists, the job skips with a notice. That lets this ticket merge before B1202.
- **`deploy-production.yml`:**
  - `workflow_dispatch` only, with inputs `ref` (a commit or tag) and `confirm`, which must be exactly `deploy production`.
  - The ref must resolve to a commit on `main` whose `ci-ok` check passed.
  - Then it calls `RENDER_PRODUCTION_DEPLOY_HOOK` with that ref and waits for health the same way.
- **`/v1/health` reports `commit`:** Render's `RENDER_GIT_COMMIT`, read through `loadConfig` and null elsewhere. This is how the workflows know the new version is live, not the old one still answering.
- **Concurrency:** one deploy at a time per environment, never cancelled halfway.

## Consequences

- **B1202** inserts a migration step (and the marker row) before "Deploy …" in both workflows, using `STAGING_DIRECT_URL` / `PROD_DIRECT_URL`. Acceptance for B1201 can only be shown once B1202 has merged and the hook secrets exist; see the checklist.
- **Failed deploys:** Render keeps serving the previous version if the new one fails its health check, and the workflow then fails too.
- **Free plan:** services sleep when idle; the first request takes a while, and B1203 keeps them awake. The workflows wait about 20 minutes for the new commit and stop at 30.
- **Out-of-order CI runs:** "Deploy staging" deploys only the commit that is still the tip of `main`, so an older run finishing late never replaces a newer deploy.
- **Production ref:** the `ref` input must be a plain SHA or tag name (no leading `-`), resolving to a commit on `main` whose `ci-ok` check passed.
- **Build:** `npm ci --include=dev`, because `nest build` and `prisma generate` need devDependencies, whatever `NODE_ENV` is set to.
- **`/v1/health` exposes the commit hash.** It is public on GitHub anyway.
- **Render can still deploy on its own in two cases**, which the checklist closes: the first deploy when the Blueprint is created, and Blueprint Auto Sync, which applies a `render.yaml` change merged to `main`.
- **Left out:** `ci.yml`'s paths filter does not list `render.yaml`, so a PR changing only `render.yaml` skips the backend job and `deploy-config.spec.ts`. That is a one-line `.github/` change, left for your approval.

## Checklist (👤 your account steps, in this order)

1. **Render:** New → Blueprint → this repository, branch `main`.
   - Render creates both services from `render.yaml` and **deploys them once right away**. Those first deploys are expected to **fail** until B1202 has migrated the databases and written the marker row (ADR 0011). That is harmless: nothing is live yet.
   - Fill in **every** `sync: false` variable for each service (staging values for staging, production values for production; ENVIRONMENTS.md lists where each comes from). An empty `CORS_ORIGINS` would otherwise quietly fall back to `.env.example`'s localhost origin.
   - Confirm the region matches your Supabase projects; change `region` in `render.yaml` if not.
   - In the Blueprint's settings, **turn Auto Sync off**, so a merged `render.yaml` change never redeploys production. After a `render.yaml` change, sync the Blueprint by hand.
   - When you edit a service's environment variables later, choose **Save only**, not "Save, rebuild and deploy", for production. Deploys go through the workflows.
2. **Render, each service** → Settings → Deploy Hook: copy the URL (it is a secret).
3. **GitHub** → Settings → Environments: create `staging` and `production`. For **both**:
   - set **Deployment branches and tags → Selected branches and tags → `main`**. Then a workflow edited on another branch can never receive these secrets.
   - Optionally, add required reviewers to `production`.
   - Add the variables `STAGING_API_URL` and `PRODUCTION_API_URL` (each service's `https://….onrender.com`, no trailing slash) to their environments.
4. **After B1202 has merged:** add the secrets `RENDER_STAGING_DEPLOY_HOOK` (environment `staging`) and `RENDER_PRODUCTION_DEPLOY_HOOK` (environment `production`).
5. **Verify the acceptance:**
   - Merge any PR to `main`. "Deploy staging" runs after CI and ends with "Staging runs <sha>", and `GET <staging>/v1/health` shows that commit.
   - Then run "Deploy production" with a wrong confirmation: it stops before calling Render.
   - Run it again with `deploy production` and a commit on `main`: production reports that commit.
   - Production does not change on a merge; check its `/v1/health` commit after the staging deploy above.
