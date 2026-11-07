import type { EnvironmentMarkerStore } from '../config/database-environment';
import { EnvironmentGuardError, isDisposableEnv, type AppEnv } from '../config/environment';

/**
 * The CI database step for staging and production (B1202, ADR 0029), in this order:
 * 1. Read the database's `app_environment` marker. A marker for another environment (say, the
 *    production URL in the staging secret) stops everything before the database is touched.
 *    No marker means a fresh database, which this environment may claim.
 * 2. Run `prisma migrate deploy`. A failure stops here: nothing is marked, built or deployed.
 * 3. Mark a fresh database (never overwriting one) and confirm the marker now matches, so the API
 *    may boot (ADR 0011).
 */
export async function deployDatabase(deps: {
  appEnv: AppEnv;
  store: EnvironmentMarkerStore;
  migrate: () => Promise<void>;
}): Promise<'claimed' | 'matched'> {
  const { appEnv, store } = deps;
  if (isDisposableEnv(appEnv)) {
    throw new EnvironmentGuardError(
      `db:deploy is only for staging and production (APP_ENV=${appEnv}); local and test databases use prisma migrate dev / reset.`,
    );
  }

  const before = await store.read();
  if (before !== null && before !== appEnv) {
    throw new EnvironmentGuardError(
      `This database is marked "${before}" but APP_ENV is "${appEnv}". Nothing was migrated.`,
    );
  }

  await deps.migrate();

  if (before === null) await store.claim(appEnv);
  const after = await store.read();
  if (after !== appEnv) {
    throw new EnvironmentGuardError(
      `After migrating, this database is marked "${String(after)}", not "${appEnv}".`,
    );
  }
  return before === null ? 'claimed' : 'matched';
}
