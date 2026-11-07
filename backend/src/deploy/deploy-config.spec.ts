import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

// B1201 on Vercel (ADR 0028): `backend/vercel.json` and the two deploy workflows are configuration,
// so these tests check the files themselves. That a merge really updates staging, and that
// production moves only through the manual workflow, is proven on the live projects (ADR 0028
// checklist).

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (file: string): string => readFileSync(path.join(ROOT, file), 'utf8');
const yamlFile = <T>(file: string): T => parse(read(file)) as T;

interface Step {
  name?: string;
  if?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
}
interface Job {
  if?: string;
  'timeout-minutes'?: number;
  environment?: string;
  env?: Record<string, string>;
  steps: Step[];
}
interface Workflow {
  on: Record<string, unknown>;
  concurrency?: { group: string; 'cancel-in-progress': boolean };
  permissions?: Record<string, string>;
  jobs: Record<string, Job>;
}

/** Pinned so a CLI release can never change a deploy unannounced. */
const VERCEL_CLI = 'vercel@65.2.0';

describe('backend/vercel.json (B1201)', () => {
  const config = JSON.parse(read('backend/vercel.json')) as {
    installCommand?: string;
    git?: { deploymentEnabled?: unknown };
    regions?: string[];
  };

  it('turns off Git deployments: only the CI-gated workflows deploy the API', () => {
    expect(config.git?.deploymentEnabled).toBe(false);
  });

  it('installs exactly the lockfile CI tested (npm ci)', () => {
    expect(config.installCommand).toBe('npm ci');
  });

  it('runs the functions in Dublin, next to the Supabase projects (eu-west-1)', () => {
    expect(config.regions).toEqual(['dub1']);
  });

  it('lets Vercel find the NestJS entrypoint it detects (src/main.ts)', () => {
    expect(existsSync(path.join(ROOT, 'backend', 'src', 'main.ts'))).toBe(true);
  });

  it('commits no secret', () => {
    expect(read('backend/vercel.json')).not.toMatch(/postgres(ql)?:\/\/|supabase\.co|token|key/i);
  });

  it('replaces the Render Blueprint (ADR 0027 is superseded)', () => {
    expect(existsSync(path.join(ROOT, 'render.yaml'))).toBe(false);
  });
});

describe.each([
  ['staging', '.github/workflows/deploy-staging.yml'],
  ['production', '.github/workflows/deploy-production.yml'],
])('%s deploy workflow: common rules (B1201)', (environment, file) => {
  const workflow = yamlFile<Workflow>(file);
  const job = Object.values(workflow.jobs)[0]!;
  const script = job.steps.map((s) => s.run ?? '').join('\n');

  it(`uses the ${environment} GitHub environment and its Vercel project`, () => {
    expect(job.environment).toBe(environment);
    expect(job.env).toMatchObject({
      VERCEL_TOKEN: '${{ secrets.VERCEL_TOKEN }}',
      VERCEL_ORG_ID: '${{ secrets.VERCEL_ORG_ID }}',
      VERCEL_PROJECT_ID: '${{ secrets.VERCEL_PROJECT_ID }}',
    });
  });

  it('checks out exactly the commit it deploys', () => {
    const checkouts = job.steps.filter((s) => s.uses?.startsWith('actions/checkout'));
    const deployed = checkouts.at(-1);
    expect(deployed?.with?.ref).toBe('${{ env.COMMIT }}');
    // The build steps come after that checkout.
    const buildIndex = job.steps.findIndex((s) => s.run?.includes('build --prod'));
    expect(job.steps.indexOf(deployed!)).toBeLessThan(buildIndex);
  });

  it('builds and deploys that checkout with a pinned Vercel CLI, to the production target', () => {
    expect(script).toContain(`${VERCEL_CLI} pull --yes --environment=production`);
    expect(script).toContain(`${VERCEL_CLI} build --prod`);
    expect(script).toContain(`${VERCEL_CLI} deploy --prebuilt --prod`);
    // The commit reaches the running app, so /v1/health can prove which version is live.
    expect(script).toContain('--env DEPLOY_COMMIT="${COMMIT}"');
  });

  it('waits until /v1/health reports the new commit, and fails otherwise', () => {
    expect(script).toContain('/v1/health');
    expect(script).toMatch(/exit 1/);
    expect(job['timeout-minutes']).toBe(30);
  });

  it('runs one deploy at a time and never cancels one halfway', () => {
    expect(workflow.concurrency).toEqual({
      group: `deploy-${environment}`,
      'cancel-in-progress': false,
    });
  });

  it('keeps secrets and inputs out of the script text (they reach it only through env)', () => {
    expect(script).not.toContain('${{ secrets');
    expect(script).not.toContain('${{ inputs');
  });

  it('rolls back to the previous deployment when the new one never reports its commit', () => {
    // vercel deploy --prod makes a deployment live once it builds, not once it boots.
    const deploy = job.steps.findIndex((s) => s.run?.includes('deploy --prebuilt'));
    const rollback = job.steps.find((s) => s.run?.includes(`${VERCEL_CLI} rollback`));
    expect((job.steps[deploy] as Step & { id?: string }).id).toBe('deploy');
    expect(rollback?.if).toBe("failure() && steps.deploy.outcome == 'success'");
    expect(job.steps.indexOf(rollback!)).toBe(job.steps.length - 1);
  });

  it('leaves no GitHub token in the checkout that vercel build runs in', () => {
    const deployed = job.steps.filter((s) => s.uses?.startsWith('actions/checkout')).at(-1);
    expect(deployed?.with?.['persist-credentials']).toBe(false);
  });
});

describe('.github/workflows/deploy-staging.yml (B1201)', () => {
  const workflow = yamlFile<Workflow>('.github/workflows/deploy-staging.yml');
  const job = Object.values(workflow.jobs)[0]!;

  it('runs only after the CI workflow finishes on main', () => {
    expect(Object.keys(workflow.on)).toEqual(['workflow_run']);
    expect(workflow.on.workflow_run).toEqual({
      workflows: ['CI'],
      types: ['completed'],
      branches: ['main'],
    });
    expect(yamlFile<{ name: string }>('.github/workflows/ci.yml').name).toBe('CI');
  });

  it('deploys only when that CI run succeeded on a push (a merge), not a pull request', () => {
    expect(job.if).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(job.if).toContain("github.event.workflow_run.event == 'push'");
    expect(job.env).toMatchObject({ COMMIT: '${{ github.event.workflow_run.head_sha }}' });
  });

  it('skips with a notice, not a failure, until the project is configured', () => {
    const ready = job.steps.find((s) => s.name?.startsWith('Skip until'))!;
    expect(ready.run).toContain('[ -z "$VERCEL_TOKEN" ]');
    expect(ready.run).toContain('::notice::');
    expect(ready.run).not.toMatch(/exit 1/);
    // Every later step runs only when ready; the rollback only after a deploy that ran.
    for (const step of job.steps.slice(1, -1)) {
      expect(step.if).toBe("steps.ready.outputs.ready == 'true'");
    }
  });

  it('never deploys an older commit over a newer one (CI runs can finish out of order)', () => {
    const ready = job.steps.find((s) => s.name?.startsWith('Skip until'))!;
    expect(ready.run).toContain('commits/main');
    expect(ready.run).toContain('!= "$COMMIT"');
  });
});

describe('.github/workflows/deploy-production.yml (B1201)', () => {
  const workflow = yamlFile<Workflow>('.github/workflows/deploy-production.yml');
  const job = Object.values(workflow.jobs)[0]!;
  const script = job.steps.map((s) => s.run ?? '').join('\n');
  const inputs = (workflow.on.workflow_dispatch as { inputs: Record<string, unknown> }).inputs;

  it('can only be started by hand', () => {
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
    expect(Object.keys(inputs).sort()).toEqual(['confirm', 'ref']);
  });

  it('refuses unless the confirmation is typed exactly, before anything else', () => {
    expect(job.steps[0]!.run).toContain('"$CONFIRM" != "deploy production"');
    expect(job.steps[0]!.run).toMatch(/exit 1/);
  });

  it('accepts only a plain ref that is on main and whose CI passed', () => {
    expect(script).toContain('^[A-Za-z0-9][A-Za-z0-9._/-]*$');
    expect(script).toContain('git merge-base --is-ancestor "$COMMIT" origin/main');
    expect(script).toContain('check-runs');
    expect(script).toContain('ci-ok');
  });
});
