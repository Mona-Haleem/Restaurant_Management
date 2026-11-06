import { EnvironmentGuardError } from '../../config/environment';
import { assertSeedAllowed } from './seed-guard';

const LOCAL = 'postgresql://postgres:postgres@localhost:5433/tablz_dev';
const REMOTE = 'postgresql://u:p@db.abcd.supabase.co:5432/postgres';

describe('assertSeedAllowed (B401: local or test only)', () => {
  it.each(['local', 'test'])('runs on APP_ENV=%s with a local database', (appEnv) => {
    expect(assertSeedAllowed({ APP_ENV: appEnv, DATABASE_URL: LOCAL })).toBe(appEnv);
  });

  it.each(['staging', 'production'])('refuses APP_ENV=%s', (appEnv) => {
    expect(() => assertSeedAllowed({ APP_ENV: appEnv, DATABASE_URL: REMOTE })).toThrow(
      /seed only runs when APP_ENV is local or test/,
    );
  });

  it('refuses a remote database even on local', () => {
    expect(() => assertSeedAllowed({ APP_ENV: 'local', DATABASE_URL: REMOTE })).toThrow(
      EnvironmentGuardError,
    );
  });

  it('refuses a missing APP_ENV', () => {
    expect(() => assertSeedAllowed({ DATABASE_URL: LOCAL })).toThrow(/APP_ENV is not set/);
  });
});
