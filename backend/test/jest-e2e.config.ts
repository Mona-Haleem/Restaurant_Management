import type { Config } from 'jest';

// Integration tests: boot the real Nest app; from B301 on they hit real Postgres (DATABASE_URL).
const config: Config = {
  rootDir: '..',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: { '^.+\\.ts$': 'ts-jest' },
};

export default config;
