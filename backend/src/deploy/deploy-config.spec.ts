import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

// B1201: the Render Blueprint and the two deploy workflows are configuration, so these tests
// check the files themselves. That a merge really updates staging, and that production moves only
// through the manual workflow, is proven on the live services (ADR 0027 checklist).

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (file: string): string => readFileSync(path.join(ROOT, file), 'utf8');
const yamlFile = <T>(file: string): T => parse(read(file)) as T;

interface EnvVar {
  key: string;
  value?: string;
  sync?: boolean;
}
interface Service {
  type: string;
  name: string;
  runtime: string;
  rootDir: string;
  buildCommand: string;
  startCommand: string;
  healthCheckPath: string;
  autoDeployTrigger: string;
  branch?: string;
  plan: string;
  region: string;
  envVars: EnvVar[];
}
interface Step {
  name?: string;
  if?: string;
  run?: string;
  env?: Record<string, string>;
}
interface Job {
  'timeout-minutes'?: number;
  if?: string;
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

const SECRETS = ['DATABASE_URL', 'DIRECT_URL', 'CORS_ORIGINS'];

describe('render.yaml (B1201)', () => {
  const blueprint = yamlFile<{ services: Service[] }>('render.yaml');
  const byName = (name: string): Service => {
    const service = blueprint.services.find((s) => s.name === name);
    if (!service) throw new Error(`render.yaml has no service ${name}`);
    return service;
  };
  const staging = byName('tablz-api-staging');
  const production = byName('tablz-api-production');

  it('defines exactly the two API services', () => {
    expect(blueprint.services.map((s) => s.name).sort()).toEqual([
      'tablz-api-production',
      'tablz-api-staging',
    ]);
  });

  it.each([
    ['staging', staging],
    ['production', production],
  ])('%s builds the backend and starts the compiled app', (_env, service) => {
    expect(service).toMatchObject({
      type: 'web',
      runtime: 'node',
      rootDir: 'backend',
      // devDependencies too: nest build and prisma generate need them, whatever NODE_ENV is.
      buildCommand: 'npm ci --include=dev && npm run build',
      startCommand: 'npm start',
    });
    const pkg = JSON.parse(read('backend/package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts.start).toBe('node dist/main.js');
  });

  it.each([
    ['staging', staging],
    ['production', production],
  ])('%s health-checks the real /v1/health route (never the database)', (_env, service) => {
    expect(service.healthCheckPath).toBe('/v1/health');
    const spec = JSON.parse(read('backend/openapi.json')) as {
      paths: Record<string, { get?: unknown }>;
    };
    expect(spec.paths['/v1/health']?.get).toBeDefined();
  });

  it.each([
    ['staging', staging],
    ['production', production],
  ])('%s never deploys by itself: only the CI-gated workflows trigger it', (_env, service) => {
    expect(service.autoDeployTrigger).toBe('off');
  });

  it('runs each service with its own APP_ENV and Node 24 (.nvmrc)', () => {
    const value = (service: Service, key: string): string | undefined =>
      service.envVars.find((e) => e.key === key)?.value;
    expect(value(staging, 'APP_ENV')).toBe('staging');
    expect(value(production, 'APP_ENV')).toBe('production');
    const nvmrc = read('.nvmrc').trim();
    expect(value(staging, 'NODE_VERSION')).toBe(nvmrc);
    expect(value(production, 'NODE_VERSION')).toBe(nvmrc);
  });

  it.each([
    ['staging', staging],
    ['production', production],
  ])('%s keeps every secret out of the repo (typed into the dashboard)', (_env, service) => {
    for (const key of SECRETS) {
      expect(service.envVars).toContainEqual({ key, sync: false });
    }
    // Nothing that looks like a connection string or key is committed.
    expect(read('render.yaml')).not.toMatch(/postgres(ql)?:\/\/|supabase\.co|password/i);
  });
});

describe('.github/workflows/deploy-staging.yml (B1201)', () => {
  const workflow = yamlFile<Workflow>('.github/workflows/deploy-staging.yml');
  const job = Object.values(workflow.jobs)[0]!;
  const script = job.steps.map((s) => s.run ?? '').join('\n');

  it('runs only after the CI workflow finishes on main', () => {
    expect(Object.keys(workflow.on)).toEqual(['workflow_run']);
    expect(workflow.on.workflow_run).toEqual({
      workflows: ['CI'],
      types: ['completed'],
      branches: ['main'],
    });
    const ci = yamlFile<{ name: string }>('.github/workflows/ci.yml');
    expect(ci.name).toBe('CI');
  });

  it('deploys only when that CI run succeeded on a push (a merge), not a pull request', () => {
    expect(job.if).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(job.if).toContain("github.event.workflow_run.event == 'push'");
  });

  it('deploys exactly the commit CI tested, through the staging deploy hook', () => {
    expect(job.environment).toBe('staging');
    expect(job.env).toMatchObject({
      DEPLOY_HOOK: '${{ secrets.RENDER_STAGING_DEPLOY_HOOK }}',
      COMMIT: '${{ github.event.workflow_run.head_sha }}',
    });
    expect(script).toContain('ref=${COMMIT}');
  });

  it('waits until /v1/health reports the new commit, and fails otherwise', () => {
    expect(script).toContain('/v1/health');
    expect(script).toMatch(/exit 1/);
  });

  it('skips with a notice, not a failure, until the hook and URL are configured', () => {
    const ready = job.steps.find((s) => s.name?.startsWith('Skip until'))!;
    expect(ready.run).toContain('[ -z "$DEPLOY_HOOK" ] || [ -z "$API_URL" ]');
    expect(ready.run).toContain('::notice::');
    expect(ready.run).not.toMatch(/exit 1/);
    for (const step of job.steps.filter((s) => s.run?.includes('DEPLOY_HOOK}'))) {
      expect(step.if).toBe("steps.ready.outputs.ready == 'true'");
    }
  });

  it('never deploys an older commit over a newer one (CI runs can finish out of order)', () => {
    expect(script).toContain('commits/main');
    expect(script).toContain('!= "$COMMIT"');
  });

  it('gives up after 30 minutes at most', () => {
    expect(job['timeout-minutes']).toBe(30);
  });

  it('runs one deploy at a time and never cancels one halfway', () => {
    expect(workflow.concurrency).toEqual({ group: 'deploy-staging', 'cancel-in-progress': false });
    expect(workflow.permissions).toEqual({ contents: 'read' });
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

  it('refuses unless the confirmation is typed exactly, before calling Render', () => {
    const confirmStep = job.steps.findIndex((s) => (s.run ?? '').includes('deploy production'));
    const hookStep = job.steps.findIndex((s) => (s.run ?? '').includes('DEPLOY_HOOK'));
    expect(confirmStep).toBeGreaterThanOrEqual(0);
    expect(confirmStep).toBeLessThan(hookStep);
    expect(job.steps[confirmStep]!.run).toMatch(/exit 1/);
  });

  it('deploys only a commit whose CI run passed on main', () => {
    expect(script).toContain('check-runs');
    expect(script).toContain('ci-ok');
  });

  it('uses the production hook and environment, and waits for health', () => {
    expect(job.environment).toBe('production');
    expect(job.env).toMatchObject({ DEPLOY_HOOK: '${{ secrets.RENDER_PRODUCTION_DEPLOY_HOOK }}' });
    expect(script).toContain('ref=${COMMIT}');
    expect(script).toContain('/v1/health');
  });

  it('accepts only a plain ref that is on main', () => {
    expect(script).toContain('^[A-Za-z0-9][A-Za-z0-9._/-]*$');
    expect(script).toContain('git merge-base --is-ancestor "$COMMIT" origin/main');
    expect(job['timeout-minutes']).toBe(30);
  });

  it('never runs two production deploys at once', () => {
    expect(workflow.concurrency).toEqual({
      group: 'deploy-production',
      'cancel-in-progress': false,
    });
  });
});
