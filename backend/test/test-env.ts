/** The integration-test database. Never the dev database, never a remote one. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/tablz_test';

/** Env for anything the tests start: explicit values, so a developer's `.env` can never leak in. */
export function testEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  // Drop app settings a developer may have exported in their shell, so spawned processes
  // see exactly what each test sets.
  const inherited = { ...process.env };
  for (const key of ['PORT', 'LOG_LEVEL', 'CORS_ORIGINS']) delete inherited[key];
  return {
    ...inherited,
    APP_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    DIRECT_URL: TEST_DATABASE_URL,
    ...overrides,
  };
}
