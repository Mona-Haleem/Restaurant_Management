import { EnvironmentGuardError, isDisposableEnv, type AppEnv } from './environment';

/** Reads and writes the single `app_environment` row. Implemented over Prisma in boot-guard.ts. */
export interface EnvironmentMarkerStore {
  read(): Promise<string | null>;
  /** Inserts the row if there is none; never overwrites an existing one. */
  claim(appEnv: AppEnv): Promise<void>;
}

export type MarkerCheckResult = 'matched' | 'claimed';

/**
 * Boot guard 2: the database itself says which environment it belongs to, so a production URL
 * pasted into a local `.env` is refused even if its host looks harmless.
 * An unmarked database is claimed only by local/test; staging/production are marked by CI.
 */
export async function assertDatabaseEnvironment(
  store: EnvironmentMarkerStore,
  appEnv: AppEnv,
): Promise<MarkerCheckResult> {
  let marker = await store.read();
  let result: MarkerCheckResult = 'matched';

  if (marker === null) {
    if (!isDisposableEnv(appEnv)) {
      throw new EnvironmentGuardError(
        `This database has no app_environment row, and APP_ENV=${appEnv} never claims one. ` +
          'Mark it from the CI migration workflow (docs/ENVIRONMENTS.md).',
      );
    }
    await store.claim(appEnv);
    marker = await store.read(); // another process may have claimed it first
    result = 'claimed';
  }

  if (marker !== appEnv) {
    throw new EnvironmentGuardError(
      `This database is marked "${String(marker)}" but APP_ENV is "${appEnv}". Refusing to start.`,
    );
  }
  return result;
}
