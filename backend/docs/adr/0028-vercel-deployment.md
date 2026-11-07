# ADR 0028 — API deployment on Vercel

- **Status:** accepted
- **Date:** 2026-11-07
- **Supersedes:** [ADR 0027](0027-render-deployment.md) (Render) · **Tickets:** B1201 (then B1202, B1203)

## Context

ADR 0027 put the API on Render, but Render requires a payment method for this workspace (`render blueprints validate` reports `need_payment_info`). The frontend already runs on Vercel, and Vercel deploys a NestJS app with zero configuration: it detects `src/main.ts` and runs the app as one Vercel Function on Fluid compute. The Hobby plan is free and needs no card, but it is for **non-commercial, personal use only**; Tablz is a portfolio project, so Hobby fits. A paying customer would mean moving both apps to Pro.

The B1201 acceptance is unchanged: a merge to `main` updates staging with no manual step, and production changes only through the manual workflow. B1202 must still run `migrate deploy` before each deploy.

## Options considered

1. **One Vercel project, with Preview as staging.** It is simple, but every PR's preview deployment would run unreviewed code against the staging database.
2. **Two Vercel projects (`tablz-api-staging`, `tablz-api-production`), each with its own Supabase project and `APP_ENV`, deployed from GitHub Actions with the Vercel CLI.** This maps one-to-one onto ADR 0011's environments.

## Decision

Option 2.

- **`backend/vercel.json`:** `git.deploymentEnabled: false`, so Vercel never deploys the API on a push; only the workflows do. `regions: ["dub1"]` (Dublin) puts the functions next to the Supabase projects in `eu-west-1`.
- **Both projects:** Root Directory `backend`, framework NestJS (detected), Node.js 24. Variables `APP_ENV`, `DATABASE_URL`, `CORS_ORIGINS` and `DATABASE_POOL_MAX` are set in each project's **Production** environment; we always deploy with `--prod`. `DIRECT_URL` (the migration credentials) is **not** given to the functions: migrations run from CI (B1202, GitHub secrets `STAGING_DIRECT_URL` / `PROD_DIRECT_URL`).
- **`deploy-staging.yml`:**
  - Runs when `CI` succeeds for a push to `main`. It skips when that commit is no longer the tip of `main`, and skips with a notice until the Vercel secrets exist.
  - Checks out exactly that commit.
  - Runs `vercel pull` → `vercel build --prod` → `vercel deploy --prebuilt --prod --env DEPLOY_COMMIT=<sha>`, with the pinned CLI `vercel@65.2.0`.
  - Waits until `/v1/health` reports the commit; if it never does, rolls back to the previous deployment (`vercel rollback`).
- **`deploy-production.yml`:** manual only. It needs a typed `deploy production`, and a plain ref on `main` whose `ci-ok` passed, then builds, deploys, health-checks and (on failure) rolls back that commit the same way.
- **`/v1/health` `commit`** now comes from `DEPLOY_COMMIT` (ADR 0027's `RENDER_GIT_COMMIT` is gone).
- **Serverless adjustments:**
  - **Env files:** a process whose `APP_ENV` is already `staging` or `production` reads no `.env` / `.env.example`, so a missing variable fails loudly instead of quietly taking a local value.
  - **`DATABASE_POOL_MAX`** (default 10, e.g. 3 on Vercel) caps each instance's connections to the Supabase transaction pooler.
  - **Rate limit:** the in-memory limit (ADR 0018) is per function instance, so it is approximate on Vercel; a shared store would make it exact.

## Consequences

- **B1202** adds `migrate deploy` and the marker row before "Build this commit with Vercel" in both workflows ([ADR 0029](0029-migration-workflows.md)). Acceptance can only be shown once it has merged and the secrets exist (checklist).
- **Failed deploys:** a failed *build* or upload leaves the previous deployment live. But `vercel deploy --prod` makes a deployment live as soon as it builds; Vercel never checks that it boots. A deployment that crashes at start (for example a boot-guard refusal) is live until the health wait gives up and the workflow runs `vercel rollback`, up to about 13 minutes of failed requests. Render's health-gated switch (ADR 0027) has no free equivalent here; staging catches most such problems before production.
- **Cold starts:** the first request after idle time is slower. No keep-alive is needed for the API itself. B1203 still calls `/v1/health/db` every 3 days so the free Supabase projects do not pause.
- **Unverified until the first real deploy:** NestJS 12 (ESM-only packages) and the generated Prisma client inside Vercel's zero-config NestJS build, `argon2` (a native module built on the Ubuntu runner, run on Vercel), `--env` on a `--prebuilt` deploy, and `vercel rollback` without a prompt in CI. Before the first deploy, check that the pinned CLI exists: `npm view vercel@65.2.0 version`. If either fails, the fix belongs in this ticket's follow-up, not in the app's rules.
- `render.yaml` is removed. ADR 0027 is kept for history, marked superseded.

## Checklist (👤 your account steps, in this order)

1. **Install and sign in to the Vercel CLI** on your machine:
   - `npm i -g vercel`, then `vercel login`.
   - Use the same Vercel account (Hobby) as the frontend.
2. **Create the staging project.** From the repository root, run `vercel link`:
   - Answer **"no"** to linking an existing project, and name it `tablz-api-staging`.
   - When asked where the code is, answer **`./backend`**.
   - If it offers to connect the GitHub repository, that is fine: `vercel.json` stops it from deploying on pushes.
   - Open `.vercel/project.json` (git-ignored) and note `orgId` and `projectId`.
3. **Create the production project:** the same as step 2, named `tablz-api-production`. Note its `projectId`; the `orgId` is the same.
4. **In the Vercel dashboard, for each project** → Settings:
   - **Build and Deployment:** Root Directory `backend`, Framework Preset NestJS (detected), Node.js Version **24.x**.
   - **Environment Variables**, environment **Production**:
     - `APP_ENV`: `staging` or `production`.
     - `DATABASE_URL`: the transaction pooler (6543) of that project's Supabase.
     - `CORS_ORIGINS`: the matching frontend origins.
     - `DATABASE_POOL_MAX`: `3`.
     - Or use `vercel env add <NAME> production` while the folder is linked to that project (run `vercel link` for it again first): it prompts for the value, so it never lands in shell history.
     - Do **not** add `DIRECT_URL`: only the CI migrations need it.
   - When both projects are configured, delete the local `.vercel` folder.
   - **Deployment Protection:** keep the default (Vercel Authentication on preview deployments). The production domain stays public, which the frontend needs.
   - Note the production domain, e.g. `https://tablz-api-staging.vercel.app`.
5. **Vercel access token:** Account Settings → Tokens → create one for GitHub Actions (scope: your account), with an expiry you will renew. It is a secret.
6. **GitHub** → Settings → Environments: create `staging` and `production`. For **both**:
   - Deployment branches and tags → **Selected branches and tags → `main`**, so a workflow edited on another branch never gets these secrets.
   - Optionally, add required reviewers to `production`.
   - Variables: `STAGING_API_URL` / `PRODUCTION_API_URL` = the production domain from step 4, with no trailing slash.
7. **After B1202 has merged**, add the secrets to each environment (together with `STAGING_DIRECT_URL` / `PROD_DIRECT_URL`, [ADR 0029](0029-migration-workflows.md) checklist):
   - `VERCEL_TOKEN` (step 5) and `VERCEL_ORG_ID`.
   - `VERCEL_PROJECT_ID`: the staging project's id in `staging`, the production project's id in `production`.
8. **Verify the acceptance:**
   - Merge any PR to `main`. "Deploy staging" runs after CI and ends with "Staging runs <sha>", and `GET <staging>/v1/health` shows that commit.
   - Production's `/v1/health` still shows its old commit, or nothing yet.
   - In GitHub Actions, run "Deploy production" **from branch `main`** (the environment allows no other branch) with a wrong confirmation: it stops at the first step.
   - Run it again with `deploy production` and a commit on `main`: production reports that commit.
9. **Frontend:** point the staging and preview frontends at the staging API URL, and only the production frontend at the production API (ROADMAP §2, rule 7).
