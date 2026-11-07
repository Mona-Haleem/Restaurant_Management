# ADR 0031 — Encrypted backups and the restore drill

- **Status:** accepted
- **Date:** 2026-11-07
- **Answers:** ROADMAP B1204 · **Tickets:** B1204

## Context

ROADMAP B1204 asks for:
- a scheduled `pg_dump` of production (and a lighter one for staging), stored as a private, time-limited artifact;
- a documented restore into local Docker, performed once for real.

Acceptance: the drill succeeds and row counts match, and the runbook states how long a dump is kept.

Free Supabase projects have no automated backups. Three constraints shape the design:
- **The repository is public.** Anyone who can read it, which means any signed-in GitHub user, can download its Actions artifacts, and their retention is capped at 90 days. An artifact cannot be "private" here.
- **Tool version:** the Supabase servers are expected to run Postgres 17, matching `docker-compose.yml` (still to verify in the dashboard), and the runner's own `pg_dump` is older. A v17 `pg_dump` also dumps an older server, so either way the image works.
- **CLAUDE.md rule 7:** Claude never connects to staging or production.

## Options considered

1. **Make the repository private.** Artifacts become private and can be kept up to 400 days, but Actions minutes become limited (2,000 a month on the free plan), and the project is a public portfolio.
2. **Keep it public and encrypt every backup before upload** (gpg, AES-256, passphrase in a GitHub environment secret). Only the passphrase holder can read a backup.
3. **External storage (a bucket).** Needs another account and its credentials. More moving parts for the same result.

## Decision

Option 2.

- **`backup.yml`:**
  - **Schedule:** production daily at 02:41 UTC, kept **30 days**; staging on Sundays at 03:13 UTC, kept **7 days** (the "lighter" one). A manual trigger accepts `production`, `staging` or `both`.
  - **Environments:** a `targets` job turns the schedule or the input into a matrix of GitHub environments, with `fail-fast: false`.
- **The dump:**
  - `pg_dump --format=custom --schema=public --no-owner --no-privileges` from the official `postgres:17` image (the same image as `docker-compose.yml`). Only the app's schema, including `_prisma_migrations`; none of Supabase's internal schemas.
  - **Consistency:** the exact row count of every table (`scripts/backup/table-counts.sql`) is taken before and after the dump. If the two differ, the dump is retried, up to three times. `pg_dump`'s own snapshot is always consistent. The counts match that snapshot on an insert-mostly database like this one, where business data is never hard-deleted (rule 5). An insert and a delete landing between the two counts could hide each other, and B1205's demo reset deletes rows on staging. Staging's counts are therefore best-effort while a reset runs. Exact counts would need `pg_export_snapshot()` + `pg_dump --snapshot`, which needs one session held open across two containers.
  - `manifest.json` records the environment, time, commit, latest applied migration and pg_dump version.
- **Credentials:** a dedicated read-only `backup` login per Supabase project (`BACKUP_DATABASE_URL`, session pooler), never the migration or admin credentials. The URL reaches the container by variable name, never on a command line.
- **Encryption:**
  - The bundle is tarred, then encrypted with `gpg --symmetric --cipher-algo AES256`, with `BACKUP_PASSPHRASE` given on a file descriptor.
  - Every plain file is removed. Only the `.tar.gpg` is uploaded, with `actions/upload-artifact` pinned to a commit and `if-no-files-found: error`.
  - The workflow token has no permissions.
- **Restore (`npm run db:restore -- <file>`), local only:**
  1. gpg decrypts the file. It asks for the passphrase, or reads `BACKUP_PASSPHRASE` for scripted runs.
  2. The tool recreates the scratch database `tablz_restore` (guarded: never another name), drops its empty `public` schema (the dump creates it), and runs `pg_restore` inside the compose container.
  3. It counts rows with the same SQL file and compares them with `counts.tsv`, using the pure `compareCounts`. It exits 1 on any difference.
- **The drill:** Claude proved the tooling end to end on a local `tablz_dev` backup made with the workflow's exact commands: all 21 tables match. The **real** drill uses a production backup, so the user runs it (rule 7) and records it in `docs/RUNBOOK.md`.

## Consequences

- **Lost passphrase:** if a passphrase is lost, its backups cannot be read. The runbook says to rotate it and take a new backup at once.
- **Restored data on a laptop:** a restored production dump is real data on a developer machine. The runbook says to drop `tablz_restore` and delete the files after use. Its marker says `production`, so the app's boot guard refuses it.
- **Counts:** row counts are compared exactly. A table whose count changed between the two counts makes the workflow retry, not fail, until the third attempt.
- **Recovering into Supabase** is deliberately not automated; the runbook says to restore locally first and decide with a plan.
- **Unverified until it runs on GitHub, or on your machine:**
  - the `backup` login's grants on Supabase (`pg_read_all_data`, or the fallback grants in the checklist);
  - Docker on the runner reaching the pooler;
  - the interactive gpg prompt of `npm run db:restore` in Git Bash. It uses `--pinentry-mode loopback`; the runbook has a fallback.
- **The fallback grants' default privileges** cover new tables only because migrations run as the `postgres` user (`DIRECT_URL`, ADR 0029). If migrations ever run as another role, new tables would not be readable by `backup`, and the next backup would fail loudly at `pg_dump`.

## Checklist (🤝 your account steps)

1. **Create a read-only `backup` login in each Supabase project** (staging, then production), with a different long random password each time, letters and digits only. In the SQL editor:
   ```sql
   create role backup login password '<password>';
   grant pg_read_all_data to backup;
   ```
   If Supabase refuses `pg_read_all_data` ("permission denied to grant role"), use these grants instead. The default privileges cover tables that future migrations add:
   ```sql
   grant usage on schema public to backup;
   grant select on all tables in schema public to backup;
   grant select on all sequences in schema public to backup;
   alter default privileges for role postgres in schema public grant select on tables to backup;
   alter default privileges for role postgres in schema public grant select on sequences to backup;
   ```
2. **Build its connection string** from the project's **Session pooler** (5432) string: user `backup.<project-ref>`, the new password, and `?sslmode=require` at the end.
3. **GitHub → Settings → Environments**, in each of `staging` and `production`:
   - secret `BACKUP_DATABASE_URL`: the string from step 2 for that project;
   - secret `BACKUP_PASSPHRASE`: a new long random passphrase, a different one per environment. **Save each in your password manager first.**
4. **First run:** Actions → Backup → Run workflow → `both`. Both jobs pass, and each run shows one artifact.
5. **The real drill:** download the production artifact, unzip it, and in Git Bash in `backend/` run `npm run db:restore -- <file>`.
   - It must end with `✔ … all N tables match …`.
   - Add a line to the drill record in `docs/RUNBOOK.md` with the date and that line, then drop `tablz_restore` and delete the files.
6. **The next day,** check that the scheduled production run passed on its own, and again on the first Sunday for staging.
