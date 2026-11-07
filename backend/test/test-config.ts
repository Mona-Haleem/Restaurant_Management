import type { AppConfig } from '../src/config/app-config';
import { TEST_DATABASE_URL } from './test-env';

/** A valid config for building the app in tests. */
export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    appEnv: 'test',
    port: 0,
    databaseUrl: TEST_DATABASE_URL,
    directUrl: TEST_DATABASE_URL,
    corsOrigins: ['http://localhost:4200'],
    logLevel: 'silent',
    // High enough that ordinary suites never hit it; the rate-limit test sets its own.
    rateLimit: { max: 10_000, windowSeconds: 60 },
    gitCommit: null,
    ...overrides,
  };
}
