// The restore drill (B1204, ADR 0031): `npm run db:restore -- <backup.tar.gpg>`.
// Local only: decrypts a backup downloaded from the Backup workflow, recreates the scratch
// database tablz_restore in the local Docker container, restores into it with the container's own
// pg_restore (same major version as Supabase), and compares every table's row count with the
// counts taken at backup time. Exits non-zero on any mismatch. Never touches tablz_dev/tablz_test.
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isDisposableEnv, parseAppEnv } from '../config/environment';
import { loadEnvFiles } from '../config/load-env';
import {
  assertRestoreDatabase,
  compareCounts,
  parseCounts,
  RESTORE_DATABASE,
  type CountRow,
} from './restore-check';

/** backend/, from backend/dist/backup. */
const BACKEND = path.join(__dirname, '..', '..');
const COUNTS_SQL = path.join(BACKEND, 'scripts', 'backup', 'table-counts.sql');

function run(
  command: string,
  args: string[],
  options: SpawnSyncOptions & { what: string },
): string {
  const result = spawnSync(command, args, { cwd: BACKEND, encoding: 'utf8', ...options });
  if (result.error) throw new Error(`${options.what}: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = String(result.stderr ?? '').trim();
    throw new Error(`${options.what} failed (exit ${String(result.status)}). ${detail}`.trim());
  }
  return typeof result.stdout === 'string' ? result.stdout : '';
}

/** psql inside the compose `db` container, as its local superuser. */
function psql(args: string[], what: string, input?: string): string {
  return run(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'db',
      'psql',
      '-U',
      'postgres',
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      ...args,
    ],
    { what, input, stdio: ['pipe', 'pipe', 'pipe'] },
  );
}

function decrypt(file: string, out: string): void {
  const passphrase = process.env.BACKUP_PASSPHRASE;
  if (passphrase) {
    // Non-interactive (scripts, the local tooling test): passphrase on stdin, never in argv.
    run(
      'gpg',
      [
        '--batch',
        '--yes',
        '--pinentry-mode',
        'loopback',
        '--passphrase-fd',
        '0',
        '--decrypt',
        '--output',
        out,
        file,
      ],
      { what: 'Decrypting the backup', input: passphrase, stdio: ['pipe', 'inherit', 'pipe'] },
    );
  } else {
    // Interactive: gpg asks on the terminal itself (loopback). Without it, Git for Windows' gpg
    // looks for a pinentry program, which often fails when started from node in Git Bash.
    run('gpg', ['--yes', '--pinentry-mode', 'loopback', '--decrypt', '--output', out, file], {
      what: 'Decrypting the backup',
      stdio: 'inherit',
    });
  }
}

function printCounts(rows: CountRow[]): void {
  const show = (n: bigint | null): string => (n === null ? 'missing' : n.toString());
  const width = Math.max(...rows.map((r) => r.table.length), 5);
  process.stdout.write(`\n${'table'.padEnd(width)}  backup  restored\n`);
  for (const r of rows) {
    process.stdout.write(
      `${r.table.padEnd(width)}  ${show(r.expected).padStart(6)}  ${show(r.actual).padStart(8)}${r.ok ? '' : '   <- differs'}\n`,
    );
  }
}

function main(): number {
  const file = process.argv[2];
  if (!file || !existsSync(file)) {
    process.stderr.write('Usage: npm run db:restore -- <path to tablz-*.tar.gpg>\n');
    return 2;
  }
  loadEnvFiles(BACKEND);
  const appEnv = parseAppEnv(process.env.APP_ENV);
  if (!isDisposableEnv(appEnv)) {
    throw new Error(`The restore drill runs only on a local machine (APP_ENV=${appEnv}).`);
  }
  assertRestoreDatabase(RESTORE_DATABASE);

  const work = mkdtempSync(path.join(tmpdir(), 'tablz-restore-'));
  try {
    const bundle = path.join(work, 'bundle.tar');
    decrypt(path.resolve(file), bundle);
    // Relative name, run inside `work`: GNU tar (Git Bash) reads "C:..." as a remote host.
    run('tar', ['-xf', 'bundle.tar'], {
      what: 'Unpacking the backup',
      stdio: 'inherit',
      cwd: work,
    });
    const manifest = JSON.parse(readFileSync(path.join(work, 'manifest.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    process.stdout.write(
      `Backup of ${String(manifest.environment)} from ${String(manifest.createdAt)} ` +
        `(latest migration ${String(manifest.latestMigration)}, ${String(manifest.pgDump)}).\n`,
    );
    const expected = parseCounts(readFileSync(path.join(work, 'counts.tsv'), 'utf8'));

    psql(
      ['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${RESTORE_DATABASE} WITH (FORCE)`],
      'Dropping the old restore',
    );
    psql(
      ['-d', 'postgres', '-c', `CREATE DATABASE ${RESTORE_DATABASE}`],
      'Creating the restore database',
    );
    // The dump (pg_dump --schema=public) creates the public schema itself, so the brand-new,
    // empty database must not have one yet.
    psql(['-d', RESTORE_DATABASE, '-c', 'DROP SCHEMA public'], 'Preparing the restore database');
    run(
      'docker',
      [
        'compose',
        'exec',
        '-T',
        'db',
        'pg_restore',
        '-U',
        'postgres',
        `--dbname=${RESTORE_DATABASE}`,
        '--no-owner',
        '--no-privileges',
        '--exit-on-error',
      ],
      {
        what: 'Restoring',
        input: readFileSync(path.join(work, 'tablz.dump')),
        stdio: ['pipe', 'inherit', 'pipe'],
        encoding: 'buffer',
        maxBuffer: 64 * 1024 * 1024,
      },
    );

    const actual = parseCounts(
      psql(
        ['-d', RESTORE_DATABASE, '-At', '-F', '\t', '-f', '-'],
        'Counting rows',
        readFileSync(COUNTS_SQL, 'utf8'),
      ),
    );
    const result = compareCounts(expected, actual);
    printCounts(result.rows);
    if (!result.ok) {
      process.stderr.write(`\n✖ Row counts differ: the restore does not match the backup.\n\n`);
      return 1;
    }
    process.stdout.write(
      `\n✔ Restored into ${RESTORE_DATABASE}: all ${result.rows.length} tables match the backup's row counts.\n\n`,
    );
    return 0;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(
    `\n✖ Restore failed: ${error instanceof Error ? error.message : String(error)}\n\n`,
  );
  process.exitCode = 1;
}
