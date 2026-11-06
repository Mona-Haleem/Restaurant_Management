import {
  assertDatabaseUrlAllowed,
  assertPrismaCommandAllowed,
  EnvironmentGuardError,
  isGuardedPrismaCommand,
  parseAppEnv,
} from './environment';

// Fake hosts only: these URLs are never connected to.
const LOCAL_URL = 'postgresql://postgres:postgres@localhost:5433/tablz_dev';
const COMPOSE_URL = 'postgresql://postgres:postgres@db:5432/tablz_dev';
const SUPABASE_DIRECT = 'postgresql://postgres:secret@db.abcdefghijkl.supabase.co:5432/postgres';
const SUPABASE_POOLER =
  'postgresql://postgres.abcdefghijkl:secret@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';
const REMOTE_URL = 'postgresql://app:secret@db.example.com:5432/tablz';

describe('parseAppEnv', () => {
  it.each(['local', 'test', 'staging', 'production'])('accepts %s', (value) => {
    expect(parseAppEnv(value)).toBe(value);
  });

  it('refuses a missing APP_ENV with a clear message', () => {
    expect(() => parseAppEnv(undefined)).toThrow(EnvironmentGuardError);
    expect(() => parseAppEnv('')).toThrow(/APP_ENV is not set/);
  });

  it.each(['prod', 'dev', 'LOCAL', 'staging '])('refuses the unknown value %p', (value) => {
    expect(() => parseAppEnv(value)).toThrow(
      /APP_ENV must be one of local, test, staging, production/,
    );
  });
});

describe('assertDatabaseUrlAllowed', () => {
  it.each([
    ['local', LOCAL_URL],
    ['local', COMPOSE_URL],
    ['test', 'postgresql://postgres:postgres@127.0.0.1:5432/tablz_test'],
    ['test', 'postgresql://postgres:postgres@[::1]:5432/tablz_test'],
    ['staging', SUPABASE_POOLER],
    ['production', SUPABASE_DIRECT],
  ] as const)('allows APP_ENV=%s with a matching host', (appEnv, url) => {
    expect(() => assertDatabaseUrlAllowed(appEnv, url)).not.toThrow();
  });

  it.each([
    ['local', SUPABASE_DIRECT],
    ['local', SUPABASE_POOLER],
    ['test', SUPABASE_POOLER],
    ['local', REMOTE_URL],
    // libpq connects to the ?host= / ?hostaddr= override, not the URL's host part.
    ['local', 'postgresql://postgres:postgres@localhost:5433/tablz_dev?host=db.example.com'],
    ['test', 'postgresql://postgres:postgres@localhost:5433/tablz_test?hostaddr=203.0.113.7'],
  ] as const)('refuses APP_ENV=%s pointing at a remote database (%s)', (appEnv, url) => {
    expect(() => assertDatabaseUrlAllowed(appEnv, url)).toThrow(EnvironmentGuardError);
    expect(() => assertDatabaseUrlAllowed(appEnv, url)).toThrow(/only allows a local database/);
  });

  it('allows a local ?host= override on a local APP_ENV', () => {
    expect(() =>
      assertDatabaseUrlAllowed(
        'local',
        'postgresql://postgres:postgres@db.example.com/x?host=localhost',
      ),
    ).not.toThrow();
  });

  it.each([
    ['staging', LOCAL_URL],
    ['production', COMPOSE_URL],
  ] as const)('refuses APP_ENV=%s pointing at a local database', (appEnv, url) => {
    expect(() => assertDatabaseUrlAllowed(appEnv, url)).toThrow(
      /must not point at a local database/,
    );
  });

  it('never prints the password in its message', () => {
    let message = '';
    try {
      assertDatabaseUrlAllowed('local', SUPABASE_DIRECT);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('db.abcdefghijkl.supabase.co');
    expect(message).not.toContain('secret');
  });

  it('names the variable it checked', () => {
    expect(() => assertDatabaseUrlAllowed('local', SUPABASE_DIRECT, 'DIRECT_URL')).toThrow(
      /DIRECT_URL/,
    );
  });

  it('refuses a missing or malformed URL', () => {
    expect(() => assertDatabaseUrlAllowed('local', undefined)).toThrow(/DATABASE_URL is not set/);
    expect(() => assertDatabaseUrlAllowed('local', 'not a url')).toThrow(/not a valid URL/);
  });
});

describe('isGuardedPrismaCommand', () => {
  it.each([
    [['migrate', 'reset', '--force']],
    [['migrate', 'dev', '--name', 'init']],
    [['db', 'push']],
    [['db', 'seed']],
    [['db', 'execute', '--file', 'x.sql']],
    [['--schema', 'prisma/schema.prisma', 'migrate', 'reset']],
  ])('guards %j', (args) => {
    expect(isGuardedPrismaCommand(args)).toBe(true);
  });

  it.each([
    [['generate']],
    [['validate']],
    [['format']],
    [['migrate', 'status']],
    [['migrate', 'deploy']],
    [['migrate', 'diff', '--from-empty']],
    [[]],
  ])('does not guard %j', (args) => {
    expect(isGuardedPrismaCommand(args)).toBe(false);
  });
});

describe('assertPrismaCommandAllowed', () => {
  const reset = ['migrate', 'reset', '--force'];

  it.each([
    ['local', LOCAL_URL],
    ['test', COMPOSE_URL],
  ])('lets migrate reset run on APP_ENV=%s with a local database', (appEnv, url) => {
    expect(() =>
      assertPrismaCommandAllowed(reset, { APP_ENV: appEnv, DATABASE_URL: url }),
    ).not.toThrow();
  });

  it.each([
    ['staging', SUPABASE_POOLER],
    ['production', SUPABASE_DIRECT],
    ['staging', LOCAL_URL],
    ['production', LOCAL_URL],
  ])('refuses migrate reset on APP_ENV=%s', (appEnv, url) => {
    expect(() => assertPrismaCommandAllowed(reset, { APP_ENV: appEnv, DATABASE_URL: url })).toThrow(
      /prisma migrate reset is refused: it only runs when APP_ENV is local or test/,
    );
  });

  it('refuses migrate reset when a local APP_ENV points at Supabase', () => {
    expect(() =>
      assertPrismaCommandAllowed(reset, { APP_ENV: 'local', DATABASE_URL: SUPABASE_DIRECT }),
    ).toThrow(/only allows a local database/);
  });

  it('checks DIRECT_URL too, because migrations use it', () => {
    expect(() =>
      assertPrismaCommandAllowed(reset, {
        APP_ENV: 'local',
        DATABASE_URL: LOCAL_URL,
        DIRECT_URL: SUPABASE_DIRECT,
      }),
    ).toThrow(/DIRECT_URL/);
  });

  it('refuses migrate reset when APP_ENV is missing', () => {
    expect(() => assertPrismaCommandAllowed(reset, { DATABASE_URL: LOCAL_URL })).toThrow(
      /APP_ENV is not set/,
    );
  });

  it('lets read-only and CI commands through without checking anything', () => {
    expect(() => assertPrismaCommandAllowed(['generate'], {})).not.toThrow();
    expect(() => assertPrismaCommandAllowed(['migrate', 'deploy'], {})).not.toThrow();
  });
});
