import { assertDatabaseEnvironment, type EnvironmentMarkerStore } from './database-environment';
import { EnvironmentGuardError, type AppEnv } from './environment';

class FakeStore implements EnvironmentMarkerStore {
  claims: AppEnv[] = [];
  constructor(public value: string | null) {}
  read(): Promise<string | null> {
    return Promise.resolve(this.value);
  }
  claim(appEnv: AppEnv): Promise<void> {
    this.claims.push(appEnv);
    this.value ??= appEnv; // like INSERT ... ON CONFLICT DO NOTHING
    return Promise.resolve();
  }
}

describe('assertDatabaseEnvironment', () => {
  it.each(['local', 'test', 'staging', 'production'] as const)(
    'passes when the marker equals APP_ENV=%s',
    async (appEnv) => {
      await expect(assertDatabaseEnvironment(new FakeStore(appEnv), appEnv)).resolves.toBe(
        'matched',
      );
    },
  );

  it.each([
    ['local', 'production'],
    ['local', 'staging'],
    ['test', 'production'],
    ['staging', 'production'],
    ['production', 'staging'],
  ] as const)('refuses APP_ENV=%s on a database marked %s', async (appEnv, marker) => {
    await expect(assertDatabaseEnvironment(new FakeStore(marker), appEnv)).rejects.toThrow(
      EnvironmentGuardError,
    );
    await expect(assertDatabaseEnvironment(new FakeStore(marker), appEnv)).rejects.toThrow(
      `This database is marked "${marker}" but APP_ENV is "${appEnv}"`,
    );
  });

  it.each(['local', 'test'] as const)(
    'claims an unmarked database for APP_ENV=%s',
    async (appEnv) => {
      const store = new FakeStore(null);
      await expect(assertDatabaseEnvironment(store, appEnv)).resolves.toBe('claimed');
      expect(store.claims).toEqual([appEnv]);
    },
  );

  it.each(['staging', 'production'] as const)(
    'refuses an unmarked database for APP_ENV=%s instead of claiming it',
    async (appEnv) => {
      const store = new FakeStore(null);
      await expect(assertDatabaseEnvironment(store, appEnv)).rejects.toThrow(
        /has no app_environment row/,
      );
      expect(store.claims).toEqual([]);
    },
  );

  it('refuses when another process claimed the database for a different environment first', async () => {
    const store = new FakeStore(null);
    store.claim = (): Promise<void> => {
      store.value = 'production';
      return Promise.resolve();
    };
    await expect(assertDatabaseEnvironment(store, 'local')).rejects.toThrow(/marked "production"/);
  });
});
