# ADR 0030 — Keep-alive workflow

- **Status:** accepted
- **Date:** 2026-11-07
- **Answers:** — · **Tickets:** B1203 (after B1201, ADR 0028)

## Context

ROADMAP §3 and B1203:
- Free Supabase projects pause after 7 days without activity.
- GitHub disables scheduled workflows after 60 days without repository activity.
- The API runs on Vercel Functions (ADR 0028), so the first request after idle time is a cold start.

The ticket asks for:
- a workflow every 3 days that calls `/health/db` on staging and production, with retries, and also runs a direct query;
- a manual trigger, and a non-zero exit on any failure;
- a self-heal commit after 45 quiet days;
- an independent external monitor and a monthly reminder.

The open points were these. The user decided them on 2026-11-07:
- which credentials the direct query uses;
- where the self-heal commit goes;
- how the reminder works.

## Options considered

1. **Direct query credentials:** reuse B1202's migration URLs (`STAGING_DIRECT_URL` / `PROD_DIRECT_URL`), or use a separate `KEEPALIVE_DATABASE_URL`. **Chosen: separate.** A scheduled job that runs every 3 days should not hold credentials that can change the schema.
2. **Self-heal:** an empty commit on `main`, or re-enabling the workflow through the API with no commit. **Chosen: the commit**, as the ticket says.
3. **Reminder:** a monthly GitHub issue (GitHub emails it), or a calendar entry. **Chosen: the issue.** It replaces ROADMAP §3's "monthly calendar check".

## Decision

`.github/workflows/keepalive.yml` uses no third-party actions: `curl`, `jq`, `psql` and `gh` are preinstalled on `ubuntu-latest`. The workflow-level token has no permissions (`permissions: {}`), and each job gets only what it needs.

- **`ping`**
  - Runs on cron `17 4 */3 * *` (04:17 UTC, off-peak, not :00), and by hand: `workflow_dispatch` with `job: ping` (the default) and `target: both | staging | production`.
  - The URL comes from `vars[<name>]`, indexed by the variable name, so an empty `STAGING_API_URL` can never fall through to production's URL.
  - It is a matrix over the `staging` and `production` GitHub environments, with `fail-fast: false`, so one broken environment still checks the other. Its token has no permissions.
  - Per environment:
    1. Fails if `STAGING_API_URL` / `PRODUCTION_API_URL` or the `KEEPALIVE_DATABASE_URL` secret is missing.
    2. Calls `$API_URL/v1/health/db` with `curl --fail --connect-timeout 30 --max-time 60 --retry 5 --retry-delay 20 --retry-all-errors` (about 7 minutes at worst, which covers a Vercel cold start). The JSON must say `status: ok, database: up`.
    3. Runs `psql … -c 'select 1'` with `PGCONNECT_TIMEOUT=30` and 5 attempts, 20 s apart. The output must be exactly `1`.
  - Any failure exits non-zero. GitHub then emails a failed scheduled run to whoever last changed the workflow's schedule.
- **`self-heal`**
  - Runs on the ping cron only, with `contents: write`.
  - It looks up the default branch with the API, because a schedule event carries no repository details.
  - If the last commit there is at most 45 days old, it does nothing. Otherwise it clones the branch at depth 1 and pushes an empty `chore: keep-alive after N quiet days [skip ci]` commit as `github-actions[bot]`. The token goes in a masked header, never in the clone URL.
  - By hand, `job: self-heal-dry-run` logs the age and what a scheduled run would do, and never pushes.
  - `[skip ci]` means CI does not run, so `deploy-staging` does not either.
- **`reminder`**
  - Runs on cron `43 8 1 * *`, with `issues: write`.
  - Opens "Monthly check: GitHub Actions (YYYY-MM)", assigned to the repository owner, linking the Actions tab. `job: reminder` opens one by hand.
  - The assignee assumes a user-owned repository. If the repository moves to an organization, drop `--assignee`.
- **External monitor:** a service outside GitHub (e.g. UptimeRobot), set up by the user (checklist below). Claude must not configure it (TASKS.md).
- `src/deploy/keepalive.spec.ts` checks the file:
  - the schedule, the manual trigger, both environments, timeouts and retries, and the direct query;
  - failing on missing configuration and never swallowing errors (`set -euo pipefail`, no `continue-on-error`, no `|| true`);
  - the 45-day rule, minimal permissions, SHA-pinned actions if any are ever added, and no committed secrets.

## Consequences

- **Until the variables and the secret exist, every scheduled run fails and emails.** This is the alarm working as intended. Merge after step 2 of the checklist, or disable the workflow in the Actions tab until then.
- **Reviewers:** if the `production` GitHub environment gets required reviewers, every scheduled ping waits for an approval. To protect deploys that way, move the keep-alive to a separate `keepalive-production` environment.
- **Branch protection:** the self-heal push needs `main` to accept pushes from `github-actions[bot]`. If protection refuses it, the job fails, which is visible and emailed.
- `*/3` restarts each month, so the gap is sometimes 1 or 2 days, never more than 3. That is well inside Supabase's 7 days.
- A scheduled run can start late (GitHub queues them) or be dropped under load. Two missed runs in a row still leave time before the 7-day pause, and the external monitor also queries the database.
- The acceptance (two successful runs on the schedule itself, and a failure email for a wrong URL) can only be shown on GitHub: see the checklist.
- Each ping run that uses the `staging` / `production` environments adds a deployment record to their history, about 10 a month each, next to the real deploys.
- **Unverified until it runs on GitHub:**
  - the `vars[...]` index expression;
  - `gh issue create` with `issues: write` only;
  - whether a push by `github-actions[bot]` with `GITHUB_TOKEN` counts as repository activity for the 60-day rule. Community keep-alive actions have relied on it, but GitHub does not document it.

  The manual modes cover the first two right after merge. For the third, keep the external monitor and the monthly issue as the safety net, and watch the Actions tab for a "disabled" banner.

## Checklist (👤 your account steps, in this order)

1. **Read-only role in each Supabase project** (staging, then production). In the SQL editor:
   ```sql
   create role keepalive login password '<a long random password>';
   grant connect on database postgres to keepalive;
   ```
   It needs no table rights, because `select 1` reads nothing. Build its connection string from the project's **Session pooler** (port 5432) string with user `keepalive.<project-ref>` and `?sslmode=require`.
2. **GitHub → Settings → Environments:**
   - In `staging` and `production`, add the secret `KEEPALIVE_DATABASE_URL` (the string from step 1 for that project).
   - Check that `STAGING_API_URL` / `PRODUCTION_API_URL` exist (ADR 0028, step 6).
   - Keep `production` without required reviewers (see Consequences).
3. **Branch protection on `main`** (if any): allow `github-actions[bot]` to push, or the self-heal job will fail when it finally needs to commit.
4. **Notifications:** GitHub → Settings → Notifications → System → Actions: email on failed workflows. Merge this PR yourself: GitHub emails a scheduled run's failure to whoever last changed its cron.
5. **External monitor** (e.g. UptimeRobot, free):
   - Create one HTTP(S) keyword monitor per environment on `<API_URL>/v1/health/db`, keyword `"database":"up"`, interval 30–60 minutes.
   - Set email alerts to you.
6. **Verify the acceptance:**
   - Actions → Keep-alive → Run workflow (`job: ping`, `target: both`): both matrix jobs pass.
   - Run `job: self-heal-dry-run`: it logs the last commit's age and pushes nothing.
   - Run `job: reminder`: the issue appears (close it).
   - Wrong URL: set `STAGING_API_URL` to `https://example.invalid` and run with `staging`. The job fails and an email arrives. Restore the value.
   - Wait about 6 days: two scheduled runs (04:17 UTC) show as passed.
   - On the 1st of the month, the reminder issue appears.
