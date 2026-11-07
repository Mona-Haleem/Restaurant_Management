import { EnvironmentGuardError, type AppEnv } from '../config/environment';
import { deployDatabase } from './database-deploy';

// B1202: the CI database step for staging and production. Check the database's marker before
// touching it, run `prisma migrate deploy`, then mark it so the API may boot (ADR 0011, ADR 0029).

function fakeStore(initial: string | null) {
  let marker = initial;
  const calls: string[] = [];
  return {
    calls,
    get marker() {
      return marker;
    },
    store: {
      read: jest.fn(() => {
        calls.push('read');
        return Promise.resolve(marker);
      }),
      claim: jest.fn((appEnv: AppEnv) => {
        calls.push(`claim:${appEnv}`);
        if (marker === null) marker = appEnv; // never overwrites
        return Promise.resolve();
      }),
    },
  };
}

describe('deployDatabase', () => {
  it('migrates a fresh database, then marks it for its environment', async () => {
    const db = fakeStore(null);
    const migrate = jest.fn(() => {
      db.calls.push('migrate');
      return Promise.resolve();
    });
    await expect(deployDatabase({ appEnv: 'staging', store: db.store, migrate })).resolves.toBe(
      'claimed',
    );
    expect(db.calls).toEqual(['read', 'migrate', 'claim:staging', 'read']);
    expect(db.marker).toBe('staging');
  });

  it('migrates an already-marked database of the same environment and leaves the marker', async () => {
    const db = fakeStore('production');
    const migrate = jest.fn(() => Promise.resolve());
    await expect(deployDatabase({ appEnv: 'production', store: db.store, migrate })).resolves.toBe(
      'matched',
    );
    expect(migrate).toHaveBeenCalledTimes(1);
    expect(db.store.claim).not.toHaveBeenCalled();
  });

  it('refuses before migrating when the database belongs to another environment', async () => {
    // e.g. the production URL pasted into the staging secret
    const db = fakeStore('production');
    const migrate = jest.fn(() => Promise.resolve());
    await expect(deployDatabase({ appEnv: 'staging', store: db.store, migrate })).rejects.toThrow(
      /marked "production" but APP_ENV is "staging"/,
    );
    expect(migrate).not.toHaveBeenCalled();
    expect(db.store.claim).not.toHaveBeenCalled();
  });

  it('stops when the migration fails, and does not mark a fresh database', async () => {
    const db = fakeStore(null);
    const migrate = jest.fn(() => Promise.reject(new Error('migration 2099_broken failed')));
    await expect(deployDatabase({ appEnv: 'staging', store: db.store, migrate })).rejects.toThrow(
      'migration 2099_broken failed',
    );
    expect(db.store.claim).not.toHaveBeenCalled();
    expect(db.marker).toBeNull();
  });

  it('fails when another process marked the database differently in the meantime', async () => {
    const db = fakeStore(null);
    db.store.claim.mockImplementation(() => Promise.resolve()); // someone else won the race
    db.store.read
      .mockImplementationOnce(() => Promise.resolve(null))
      .mockImplementationOnce(() => Promise.resolve('production'));
    await expect(
      deployDatabase({ appEnv: 'staging', store: db.store, migrate: () => Promise.resolve() }),
    ).rejects.toThrow(EnvironmentGuardError);
  });

  it.each(['local', 'test'] as const)(
    'is only for staging and production: refuses %s (local databases use migrate dev)',
    async (appEnv) => {
      const db = fakeStore(null);
      const migrate = jest.fn(() => Promise.resolve());
      await expect(deployDatabase({ appEnv, store: db.store, migrate })).rejects.toThrow(
        /only for staging and production/,
      );
      expect(db.store.read).not.toHaveBeenCalled();
      expect(migrate).not.toHaveBeenCalled();
    },
  );
});
