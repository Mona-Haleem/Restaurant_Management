import type { Config } from 'jest';

// Integration tests: boot the real Nest app and use the real Postgres test database.
const config: Config = {
  rootDir: '..',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  // The generated Prisma client imports its siblings with `.js` extensions.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  globalSetup: '<rootDir>/test/global-setup.ts',
  testTimeout: 60_000,
};

export default config;
