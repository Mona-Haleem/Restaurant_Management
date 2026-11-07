import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

// B1203 (ADR 0030): the keep-alive workflow is configuration, so these tests check the file
// itself. That it really runs on its schedule, and that a wrong URL fails and emails, is proven
// on GitHub (checklist in ADR 0030).

const ROOT = path.join(__dirname, '..', '..', '..');
const FILE = '.github/workflows/keepalive.yml';
const raw = (): string => readFileSync(path.join(ROOT, FILE), 'utf8');

interface Step {
  name?: string;
  id?: string;
  if?: string;
  run?: string;
  uses?: string;
  'continue-on-error'?: unknown;
}
interface Job {
  if?: string;
  'runs-on'?: string;
  'timeout-minutes'?: number;
  environment?: string;
  permissions?: Record<string, string>;
  strategy?: { 'fail-fast'?: boolean; matrix?: { environment?: unknown } };
  env?: Record<string, string>;
  'continue-on-error'?: unknown;
  steps: Step[];
}
interface Workflow {
  on: {
    schedule?: { cron: string }[];
    workflow_dispatch?: { inputs?: Record<string, { options?: string[]; default?: string }> };
  };
  permissions?: Record<string, string>;
  jobs: Record<string, Job>;
}

const PING_CRON = '17 4 */3 * *';
const REMINDER_CRON = '43 8 1 * *';

describe('keep-alive workflow (B1203)', () => {
  it('exists', () => {
    expect(existsSync(path.join(ROOT, FILE))).toBe(true);
  });

  const workflow = (): Workflow => parse(raw()) as Workflow;
  const job = (name: string): Job => {
    const found = workflow().jobs[name];
    if (!found) throw new Error(`no job "${name}" in ${FILE}`);
    return found;
  };
  const script = (name: string): string =>
    job(name)
      .steps.map((s) => s.run ?? '')
      .join('\n');

  describe('triggers', () => {
    it('pings every 3 days at an off-peak minute that is not :00', () => {
      const crons = (workflow().on.schedule ?? []).map((s) => s.cron);
      const ping = crons.find((c) => c.split(' ')[2] === '*/3');
      expect(ping).toBe(PING_CRON);
      const [minute, hour, dayOfMonth] = ping!.split(' ');
      expect(minute).not.toBe('0');
      expect(Number(minute)).toBeGreaterThan(0);
      expect(Number(hour)).toBeLessThan(6); // 04:17 UTC: night in Cairo and in Europe
      expect(dayOfMonth).toBe('*/3');
    });

    it('has a manual trigger for pre-demo warm-ups, defaulting to a ping of both environments', () => {
      const inputs = workflow().on.workflow_dispatch?.inputs;
      expect(inputs?.job?.options).toEqual(['ping', 'self-heal-dry-run', 'reminder']);
      expect(inputs?.job?.default).toBe('ping');
      expect(inputs?.target?.options).toEqual(['both', 'staging', 'production']);
      expect(inputs?.target?.default).toBe('both');
    });

    it('sends a monthly reminder on its own schedule', () => {
      expect((workflow().on.schedule ?? []).map((s) => s.cron)).toContain(REMINDER_CRON);
    });
  });

  describe('ping job', () => {
    it('runs on the ping schedule and on a manual ping only', () => {
      expect(job('ping').if).toBe(
        `github.event.schedule == '${PING_CRON}' || (github.event_name == 'workflow_dispatch' && inputs.job == 'ping')`,
      );
    });

    it('checks staging and production independently, in their GitHub environments', () => {
      const ping = job('ping');
      expect(ping.strategy?.['fail-fast']).toBe(false);
      // A scheduled run has no inputs: the expression must fall through to both environments.
      expect(String(ping.strategy?.matrix?.environment)).toMatch(
        /\|\| '\["staging","production"\]'\) \}\}$/,
      );
      expect(ping.environment).toBe('${{ matrix.environment }}');
      expect(ping.env).toMatchObject({
        DATABASE_URL: '${{ secrets.KEEPALIVE_DATABASE_URL }}',
      });
      // Indexed by name: an empty STAGING_API_URL can never fall through to production's URL.
      expect(ping.env?.API_URL).toBe(
        "${{ vars[matrix.environment == 'staging' && 'STAGING_API_URL' || 'PRODUCTION_API_URL'] }}",
      );
    });

    it('calls /v1/health/db with a generous timeout and retries for cold starts', () => {
      const run = script('ping');
      expect(run).toContain('"$API_URL/v1/health/db"');
      expect(run).toMatch(/--max-time 60/);
      expect(run).toMatch(/--retry 5/);
      expect(run).toMatch(/--retry-all-errors/);
      expect(run).toMatch(/--fail/);
      expect(run).toContain('.status == "ok" and .database == "up"');
    });

    it('also runs a trivial query directly through the database connection, with retries', () => {
      const run = script('ping');
      expect(run).toMatch(/psql "\$DATABASE_URL"[^\n]*-c 'select 1'/);
      expect(run).toContain('ON_ERROR_STOP=1');
      expect(run).toMatch(/PGCONNECT_TIMEOUT=\d+/);
      expect(run).toMatch(/for attempt in 1 2 3 4 5/);
    });

    it('fails when configuration is missing, instead of passing silently', () => {
      expect(script('ping')).toMatch(/if \[ -z "\$API_URL" \] \|\| \[ -z "\$DATABASE_URL" \]/);
    });
  });

  describe('self-heal job', () => {
    it('runs on the ping schedule, or by hand as a dry run, with contents: write only', () => {
      const heal = job('self-heal');
      expect(heal.if).toBe(
        `github.event.schedule == '${PING_CRON}' || (github.event_name == 'workflow_dispatch' && inputs.job == 'self-heal-dry-run')`,
      );
      expect(heal.permissions).toEqual({ contents: 'write' });
      expect(heal.env).toMatchObject({
        DRY_RUN: "${{ github.event_name == 'workflow_dispatch' }}",
      });
    });

    it('looks up the default branch itself (a schedule payload has no repository details)', () => {
      expect(JSON.stringify(job('self-heal').env)).not.toContain('github.event.repository');
      expect(script('self-heal')).toContain(
        'branch=$(gh api "repos/${REPO}" --jq .default_branch)',
      );
    });

    it('never pushes on a dry run, and never shows the token', () => {
      const run = script('self-heal');
      const dryRun = run.indexOf('if [ "$DRY_RUN" = "true" ]; then');
      expect(dryRun).toBeGreaterThan(-1);
      expect(dryRun).toBeLessThan(run.indexOf('git commit'));
      expect(run).toContain('echo "::add-mask::${basic}"');
      expect(run).not.toContain('x-access-token:${GH_TOKEN}@');
    });

    it('commits only when the default branch has been quiet for more than 45 days', () => {
      const heal = job('self-heal');
      expect(heal.env).toMatchObject({ QUIET_DAYS: '45' });
      const run = script('self-heal');
      // The quiet check ends in its own `exit 0` (at most two lines later), before any commit.
      const quiet =
        /if \[ "\$age_days" -le "\$QUIET_DAYS" \]; then\n(?:[^\n]*\n){0,2}\s*exit 0\n\s*fi/.exec(
          run,
        );
      expect(quiet).not.toBeNull();
      expect(run).toContain('git commit --allow-empty');
      expect(run).toContain('[skip ci]');
      expect(quiet!.index).toBeLessThan(run.indexOf('git commit'));
    });
  });

  describe('reminder job', () => {
    it('opens a monthly issue to check the Actions tab, with issues: write only', () => {
      const reminder = job('reminder');
      expect(reminder.if).toBe(
        `github.event.schedule == '${REMINDER_CRON}' || (github.event_name == 'workflow_dispatch' && inputs.job == 'reminder')`,
      );
      expect(reminder.permissions).toEqual({ issues: 'write' });
      expect(script('reminder')).toContain('gh issue create');
      expect(script('reminder')).toContain('/actions');
    });
  });

  describe('hardening', () => {
    it('grants no token permissions at the workflow level', () => {
      expect(workflow().permissions).toEqual({});
    });

    it('gives the ping job no token permissions', () => {
      expect(job('ping').permissions).toEqual({});
    });

    it('pins every action to a commit SHA (or uses none)', () => {
      const uses = Object.values(workflow().jobs).flatMap((j) =>
        j.steps.map((s) => s.uses).filter((u): u is string => !!u),
      );
      for (const u of uses) expect(u).toMatch(/@[0-9a-f]{40}$/);
    });

    it('never swallows a failure', () => {
      for (const j of Object.values(workflow().jobs)) {
        expect(j['continue-on-error']).toBeUndefined();
        for (const s of j.steps) expect(s['continue-on-error']).toBeUndefined();
      }
      expect(raw()).not.toContain('|| true');
      for (const name of Object.keys(workflow().jobs)) {
        for (const s of job(name).steps) {
          if (s.run) expect(s.run).toMatch(/^set -euo pipefail/);
        }
      }
    });

    it('bounds every job with a timeout', () => {
      for (const j of Object.values(workflow().jobs)) {
        expect(j['timeout-minutes']).toBeLessThanOrEqual(20);
      }
    });

    it('commits no secret', () => {
      expect(raw()).not.toMatch(/postgres(ql)?:\/\/|supabase\.co|vercel\.app|ghp_|password/i);
    });
  });
});
