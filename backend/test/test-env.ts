/** The integration-test database. Never the dev database, never a remote one. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/tablz_test';

/** Env for anything the tests start: explicit values, so a developer's `.env` can never leak in. */
export function testEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    APP_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    DIRECT_URL: TEST_DATABASE_URL,
    ...overrides,
  };
}
