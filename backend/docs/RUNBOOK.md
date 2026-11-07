# Runbook

What to do when something needs a human. B1401 extends this file (Supabase paused, Vercel cold starts); B1204 wrote the backup section.

## Backups (B1204, [ADR 0031](adr/0031-backups.md))

Free Supabase projects have no automated backups. The **Backup** workflow (`.github/workflows/backup.yml`) is the only safety net.

### What is kept, and for how long

| Environment | When | Kept |
| --- | --- | --- |
| production | every day at 02:41 UTC | **30 days**, then GitHub deletes it |
| staging | every Sunday at 03:13 UTC | **7 days**, then GitHub deletes it |

- **Where:** GitHub → **Actions → Backup** → a run → **Artifacts** → `tablz-<environment>-backup-<run id>`.
- **What is inside:**
  - one file, `tablz-<environment>-<UTC time>.tar.gpg`, encrypted with AES-256;
  - the `public` schema dump (`tablz.dump`, pg_dump custom format, owners and grants left out);
  - `counts.tsv` (every table's exact row count at dump time);
  - `manifest.json` (environment, time, commit, latest migration, pg_dump version).
- **Why encrypted:** the repository is public, and any signed-in GitHub user can download its artifacts. Without the passphrase a backup is unreadable.
- **The passphrases** (`BACKUP_PASSPHRASE`, one per environment) live in the GitHub environments and in your password manager. **If a passphrase is lost, every backup made with it is useless.** Make a new passphrase, update the secret, and run the workflow by hand so a readable backup exists again. A passphrase must be **one line** with no line breaks: gpg reads it only up to the first newline.
- **Backup by hand:** before a risky change, run Actions → Backup → Run workflow → `production`, `staging` or `both`.

### When a backup run fails

- GitHub emails the failure. Open the run and look at the first failing step:
  - **"Require the backup settings":** a secret is missing in that environment.
  - **Dump step, authentication or connection error:** check `BACKUP_DATABASE_URL`. Is the `backup` login still there? Is the Supabase project paused? (Restore it from the Supabase dashboard first.)
  - **"Rows kept changing during three dumps":** writes were going on during every attempt. Run it again by hand later.
- A day without a backup is not urgent; the previous ones are still kept. Two or more failures in a row are: fix them that day.

### Restoring into local Docker (the drill, and the real thing)

Run this from **Git Bash**, in `backend/`, with Docker Desktop running and `npm run db:up` done. Git for Windows provides `gpg` and `tar`.

1. Download the artifact (Actions → Backup → the run → Artifacts) and unzip it. GitHub wraps it in a `.zip`. You get one `tablz-…tar.gpg` file.
2. Run:
   ```bash
   npm run db:restore -- /path/to/tablz-production-YYYYMMDDTHHMMSSZ.tar.gpg
   ```
   - gpg asks for that environment's passphrase.
   - **If the prompt doesn't appear or fails** (for example "Inappropriate ioctl for device"), pass the passphrase through a variable instead. `read -rs` keeps it out of your history and off the screen:
     ```bash
     read -rs BACKUP_PASSPHRASE && export BACKUP_PASSPHRASE && npm run db:restore -- /path/to/file.tar.gpg; unset BACKUP_PASSPHRASE
     ```
   - The tool:
     1. recreates the separate local database **`tablz_restore`** (never `tablz_dev` or `tablz_test`);
     2. restores into it with the container's own `pg_restore` (Postgres 17, like Supabase);
     3. prints every table with its row count from the backup and after the restore.
3. **Success** is the final line `✔ Restored into tablz_restore: all N tables match the backup's row counts.` and exit code 0. A mismatch is marked `<- differs`, and the tool exits 1.
4. **Afterwards:**
   - The restored data is real production data on your machine. Look at it only as long as you need to, then remove it: `docker compose exec db psql -U postgres -c "DROP DATABASE tablz_restore"`. Delete the downloaded files.
   - Never point the app at `tablz_restore`. Its `app_environment` row says `production`, so the boot guard refuses it anyway (ADR 0011).

**Getting data back into Supabase** (a real recovery, not the drill) is a deliberate, manual operation outside this runbook's scope. Restore locally first, check the counts, then decide with the full picture. Never run `pg_restore` against production from a laptop without a plan.

### Drill record

| Date | Backup | Result | By |
| --- | --- | --- | --- |
| 2026-11-07 | local `tablz_dev` (demo seed), made with the workflow's exact dump and encryption commands | ✔ 21 tables, all counts match (tooling check, not production data) | Claude |
| _to do_ | a real **production** backup from the Backup workflow | _the "✔ … match" line_ | you |
