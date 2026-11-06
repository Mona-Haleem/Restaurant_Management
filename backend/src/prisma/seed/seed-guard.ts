import {
  assertDatabaseUrlAllowed,
  EnvironmentGuardError,
  isDisposableEnv,
  parseAppEnv,
  type AppEnv,
} from '../../config/environment';

/**
 * B401: the seed runs only when APP_ENV is local or test, against a local database.
 * Staging gets its reseed from a CI workflow (B1202), never from a developer machine.
 */
export function assertSeedAllowed(env: Readonly<Record<string, string | undefined>>): AppEnv {
  const appEnv = parseAppEnv(env.APP_ENV);
  if (!isDisposableEnv(appEnv)) {
    throw new EnvironmentGuardError(
      `The seed only runs when APP_ENV is local or test (APP_ENV=${appEnv}). ` +
        'Staging is reseeded by its CI workflow.',
    );
  }
  assertDatabaseUrlAllowed(appEnv, env.DATABASE_URL, 'DATABASE_URL');
  return appEnv;
}
