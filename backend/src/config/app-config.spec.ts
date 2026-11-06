import { ConfigValidationError, loadConfig } from './app-config';

const LOCAL_URL = 'postgresql://postgres:postgres@localhost:5433/tablz_dev';
const REMOTE_URL = 'postgresql://app:secret@db.example.com:5432/tablz';

function problemsOf(env: Record<string, string | undefined>): string[] {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigValidationError) return error.problems;
    throw error;
  }
  throw new Error('expected loadConfig to throw');
}

describe('loadConfig', () => {
  it('returns a typed config with local defaults', () => {
    expect(loadConfig({ APP_ENV: 'local', DATABASE_URL: LOCAL_URL })).toEqual({
      appEnv: 'local',
      port: 3000,
      databaseUrl: LOCAL_URL,
      directUrl: undefined,
      corsOrigins: ['http://localhost:4200'],
      logLevel: 'debug',
      rateLimit: { max: 120, windowSeconds: 60 },
    });
  });

  it('uses quiet logs by default in test and info in staging/production', () => {
    expect(loadConfig({ APP_ENV: 'test', DATABASE_URL: LOCAL_URL }).logLevel).toBe('silent');
    expect(
      loadConfig({
        APP_ENV: 'production',
        DATABASE_URL: REMOTE_URL,
        CORS_ORIGINS: 'https://tablz.app',
      }).logLevel,
    ).toBe('info');
  });

  it('parses every variable when set', () => {
    expect(
      loadConfig({
        APP_ENV: 'staging',
        PORT: '8080',
        DATABASE_URL: REMOTE_URL,
        DIRECT_URL: REMOTE_URL,
        CORS_ORIGINS: ' https://staging.tablz.app , https://tablz-*-mona.vercel.app ',
        LOG_LEVEL: 'warn',
        RATE_LIMIT_MAX: '300',
        RATE_LIMIT_WINDOW_SECONDS: '30',
      }),
    ).toEqual({
      appEnv: 'staging',
      port: 8080,
      databaseUrl: REMOTE_URL,
      directUrl: REMOTE_URL,
      corsOrigins: ['https://staging.tablz.app', 'https://tablz-*-mona.vercel.app'],
      logLevel: 'warn',
      rateLimit: { max: 300, windowSeconds: 30 },
    });
  });

  it.each([
    ['RATE_LIMIT_MAX', '0'],
    ['RATE_LIMIT_MAX', 'lots'],
    ['RATE_LIMIT_WINDOW_SECONDS', '-5'],
    ['RATE_LIMIT_WINDOW_SECONDS', '1.5'],
  ])('rejects %s=%s (B503 rate limit)', (variable, value) => {
    expect(problemsOf({ APP_ENV: 'local', DATABASE_URL: LOCAL_URL, [variable]: value })).toEqual([
      `${variable} must be a positive integer.`,
    ]);
  });

  it('stops on a missing DATABASE_URL with a clear message', () => {
    expect(() => loadConfig({ APP_ENV: 'local' })).toThrow(ConfigValidationError);
    expect(() => loadConfig({ APP_ENV: 'local', DATABASE_URL: '' })).toThrow(
      'DATABASE_URL is required.',
    );
  });

  it('reports a missing APP_ENV with the same message as the boot guard', () => {
    expect(problemsOf({ DATABASE_URL: LOCAL_URL })).toEqual([
      expect.stringContaining('APP_ENV is not set'),
    ]);
  });

  it('lists every problem at once, so one restart fixes them all', () => {
    const problems = problemsOf({
      APP_ENV: 'production',
      PORT: 'eighty',
      DATABASE_URL: 'not a url',
      LOG_LEVEL: 'loud',
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('PORT'),
        expect.stringContaining('DATABASE_URL must be a postgresql:// URL'),
        expect.stringContaining('LOG_LEVEL'),
        expect.stringContaining('CORS_ORIGINS is required when APP_ENV=production'),
      ]),
    );
    expect(problems).toHaveLength(4);
  });

  it('formats several problems as a list', () => {
    expect(() => loadConfig({ APP_ENV: 'local', PORT: '0', DATABASE_URL: '' })).toThrow(
      /2 configuration problems:\n {2}- /,
    );
  });

  it.each(['0', '65536', '3000.5', '-1'])('refuses PORT=%s', (port) => {
    expect(problemsOf({ APP_ENV: 'local', DATABASE_URL: LOCAL_URL, PORT: port })).toEqual([
      'PORT must be an integer between 1 and 65535.',
    ]);
  });

  it.each([
    ['*', 'a wildcard origin'],
    ['https://tablz.app/menu', 'a path'],
    ['tablz.app', 'no scheme'],
    ['ftp://tablz.app', 'a non-http scheme'],
    ['https://*.vercel.app', 'a wildcard over a whole shared domain'],
  ])('refuses CORS origin %p (%s)', (origin) => {
    expect(
      problemsOf({ APP_ENV: 'staging', DATABASE_URL: REMOTE_URL, CORS_ORIGINS: origin }),
    ).toEqual([expect.stringContaining(`CORS_ORIGINS has an invalid origin "${origin}"`)]);
  });

  it('never prints a password from a malformed URL', () => {
    const problems = problemsOf({
      APP_ENV: 'local',
      DATABASE_URL: 'mysql://user:topsecret@localhost/db',
    });
    expect(problems.join('\n')).not.toContain('topsecret');
  });
});
