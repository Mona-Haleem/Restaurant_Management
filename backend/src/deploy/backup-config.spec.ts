import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

// B1204 (ADR 0031): the backup workflow is configuration, so these tests check the file. The repo
// is public, so any signed-in GitHub user can download its artifacts: a backup must be encrypted
// before it is uploaded, and nothing readable may ever be uploaded.

const ROOT = path.join(__dirname, '..', '..', '..');
const FILE = '.github/workflows/backup.yml';
const text = readFileSync(path.join(ROOT, FILE), 'utf8');

interface Step {
  name?: string;
  id?: string;
  if?: string;
  run?: string;
  uses?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
  'continue-on-error'?: unknown;
}
interface Job {
  needs?: string;
  if?: string;
  'timeout-minutes'?: number;
  environment?: string;
  env?: Record<string, string>;
  permissions?: Record<string, string>;
  concurrency?: { group: string; 'cancel-in-progress': boolean };
  strategy?: { 'fail-fast'?: boolean; matrix?: Record<string, unknown> };
  outputs?: Record<string, string>;
  steps: Step[];
}
const workflow = parse(text) as {
  on: {
    schedule: { cron: string }[];
    workflow_dispatch: { inputs: Record<string, { options?: string[]; default?: string }> };
  };
  permissions?: Record<string, string>;
  concurrency?: { group: string; 'cancel-in-progress': boolean };
  jobs: Record<string, Job>;
};
const backup = workflow.jobs.backup!;
const script = backup.steps.map((s) => s.run ?? '').join('\n');

/** Pinned by commit (B1203 quality guideline): v7.0.2, published 2026-10-07. */
const UPLOAD_ARTIFACT = 'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9';

describe('backup.yml schedule and targets (B1204)', () => {
  it('backs up production daily and staging weekly, off the hour', () => {
    expect(workflow.on.schedule.map((s) => s.cron)).toEqual(['41 2 * * *', '13 3 * * 0']);
  });

  it('picks the environment from the schedule, or from the manual target', () => {
    const pick = workflow.jobs.targets!.steps.map((s) => s.run ?? '').join('\n');
    expect(pick).toContain("'41 2 * * *'");
    expect(pick).toContain("'13 3 * * 0'");
    expect(workflow.on.workflow_dispatch.inputs.target!.options).toEqual([
      'production',
      'staging',
      'both',
    ]);
    expect(backup.needs).toBe('targets');
    expect(backup.strategy?.matrix?.environment).toBe(
      '${{ fromJSON(needs.targets.outputs.environments) }}',
    );
    expect(backup.strategy?.['fail-fast']).toBe(false);
    expect(backup.environment).toBe('${{ matrix.environment }}');
  });

  it('keeps production backups 30 days and staging 7 (the runbook states the same)', () => {
    expect(backup.env?.RETENTION_DAYS).toBe("${{ matrix.environment == 'production' && 30 || 7 }}");
    const upload = backup.steps.find((s) => s.uses?.startsWith('actions/upload-artifact'))!;
    expect(upload.with?.['retention-days']).toBe('${{ env.RETENTION_DAYS }}');
    const runbook = readFileSync(path.join(ROOT, 'backend', 'docs', 'RUNBOOK.md'), 'utf8');
    expect(runbook).toMatch(/production[^\n]*30 days/i);
    expect(runbook).toMatch(/staging[^\n]*7 days/i);
  });
});

describe('backup.yml dump and encryption (B1204)', () => {
  it('dumps the public schema with the v17 tools, in custom format, owners and grants left out', () => {
    // Same major version as Supabase and the local compose file (docker-compose.yml).
    expect(backup.env?.PG_IMAGE).toBe('postgres:17');
    expect(script).toContain('"$PG_IMAGE"');
    expect(readFileSync(path.join(ROOT, 'backend', 'docker-compose.yml'), 'utf8')).toContain(
      'image: postgres:17',
    );
    expect(script).toMatch(/pg_dump --format=custom --schema=public --no-owner --no-privileges/);
  });

  it('records row counts before and after the dump, and retries if they differ', () => {
    expect(script).toContain('scripts/backup/table-counts.sql');
    expect(script).toMatch(/counts-before\.tsv/);
    expect(script).toMatch(/cmp -s/);
  });

  it('encrypts the bundle (AES-256, passphrase from a secret) and removes every plain file', () => {
    expect(script).toMatch(/gpg --batch .*--symmetric --cipher-algo AES256/s);
    expect(script).toContain('--passphrase-fd 3');
    expect(script).toMatch(/rm -rf/);
  });

  it('uploads only the encrypted file, with a pinned action, and fails if it is missing', () => {
    const uploads = backup.steps.filter((s) => s.uses?.includes('upload-artifact'));
    expect(uploads).toHaveLength(1);
    expect(uploads[0]!.uses).toBe(UPLOAD_ARTIFACT);
    expect(String(uploads[0]!.with?.path)).toMatch(/\.tar\.gpg$/);
    expect(uploads[0]!.with?.['if-no-files-found']).toBe('error');
  });

  it('never puts the database URL or the passphrase on a command line or in the script text', () => {
    expect(backup.env).toMatchObject({
      BACKUP_DATABASE_URL: '${{ secrets.BACKUP_DATABASE_URL }}',
      BACKUP_PASSPHRASE: '${{ secrets.BACKUP_PASSPHRASE }}',
    });
    expect(script).not.toContain('${{');
    // Into the container by name (-e VAR), never by value.
    expect(script).toContain('-e BACKUP_DATABASE_URL');
    expect(script).not.toMatch(/-e BACKUP_DATABASE_URL=/);
  });

  it('fails loudly: strict shell, no ignored errors, settings required up front', () => {
    for (const step of backup.steps) expect(step['continue-on-error']).toBeUndefined();
    expect(script).toContain('set -euo pipefail');
    expect(script).not.toContain('|| true');
    expect(backup.steps[0]!.run).toContain('[ -z "$BACKUP_DATABASE_URL" ]');
    expect(backup.steps[0]!.run).toContain('[ -z "$BACKUP_PASSPHRASE" ]');
  });
});

describe('backup.yml permissions and safety (B1204)', () => {
  it('gives the token no permissions, except read access to check out the counting SQL', () => {
    expect(workflow.permissions).toEqual({});
    expect(workflow.jobs.targets!.permissions ?? {}).toEqual({});
    expect(backup.permissions).toEqual({ contents: 'read' });
  });

  it('pins every action it uses to a commit SHA', () => {
    const used = Object.values(workflow.jobs).flatMap((j) =>
      j.steps.filter((s) => s.uses).map((s) => s.uses!),
    );
    for (const uses of used) expect(uses).toMatch(/@[0-9a-f]{40}$/);
  });

  it('never runs two backups of one environment at once (scheduled or by hand)', () => {
    expect(backup.concurrency).toEqual({
      group: 'backup-${{ matrix.environment }}',
      'cancel-in-progress': false,
    });
  });

  it('commits no connection string or secret', () => {
    expect(text).not.toMatch(/postgres(ql)?:\/\/|supabase\.co|password/i);
  });
});
