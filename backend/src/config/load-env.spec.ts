import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { envFileHint, loadEnvFiles } from './load-env';

describe('envFileHint', () => {
  it('explains a .env without APP_ENV hiding .env.example', () => {
    expect(envFileHint('.env', {})).toMatch(/backend\/\.env, which does not set APP_ENV/);
    expect(envFileHint('.env', { APP_ENV: '' })).not.toBeNull();
  });

  it.each([
    ['.env', { APP_ENV: 'local' }],
    ['.env.example', {}],
    [null, {}],
  ] as const)('says nothing for %p with %j', (loaded, env) => {
    expect(envFileHint(loaded, env)).toBeNull();
  });
});

describe('loadEnvFiles', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'tablz-env-'));
    delete process.env.TABLZ_SAMPLE;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.TABLZ_SAMPLE;
  });

  it('loads .env when it exists', () => {
    writeFileSync(path.join(dir, '.env'), 'TABLZ_SAMPLE=from-env\n');
    writeFileSync(path.join(dir, '.env.example'), 'TABLZ_SAMPLE=from-example\n');
    expect(loadEnvFiles(dir)).toBe('.env');
    expect(process.env.TABLZ_SAMPLE).toBe('from-env');
  });

  it('falls back to .env.example so a fresh clone works without copying files', () => {
    writeFileSync(path.join(dir, '.env.example'), 'TABLZ_SAMPLE=from-example\n');
    expect(loadEnvFiles(dir)).toBe('.env.example');
    expect(process.env.TABLZ_SAMPLE).toBe('from-example');
  });

  it('never overrides a variable that is already set (CI and the shell win)', () => {
    process.env.TABLZ_SAMPLE = 'from-shell';
    writeFileSync(path.join(dir, '.env'), 'TABLZ_SAMPLE=from-env\n');
    loadEnvFiles(dir);
    expect(process.env.TABLZ_SAMPLE).toBe('from-shell');
  });

  it.each(['staging', 'production'])(
    'reads no file when APP_ENV is already %s (a deployed service never falls back to local values)',
    (appEnv) => {
      writeFileSync(path.join(dir, '.env.example'), 'TABLZ_SAMPLE=from-example\n');
      const env: NodeJS.ProcessEnv = { APP_ENV: appEnv };
      expect(loadEnvFiles(dir, env)).toBeNull();
      expect(env.TABLZ_SAMPLE).toBeUndefined();
    },
  );

  it('does nothing when neither file exists', () => {
    expect(loadEnvFiles(dir)).toBeNull();
    expect(process.env.TABLZ_SAMPLE).toBeUndefined();
  });
});
