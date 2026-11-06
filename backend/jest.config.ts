import type { Config } from 'jest';

// Unit tests: *.spec.ts beside the code. No database.
const config: Config = {
  rootDir: 'src',
  testEnvironment: 'node',
  testMatch: ['**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  collectCoverageFrom: [
    '**/*.ts',
    '!main.ts',
    '!**/*.module.ts',
    '!**/*.spec.ts',
    '!generated/**',
    // Needs a real database: covered by test/environment-guard.e2e-spec.ts instead.
    '!config/boot-guard.ts',
    // CLI script; its output is checked by erd.spec.ts (drift test).
    '!prisma/generate-erd.ts',
    // CLI script; what it writes is checked by openapi.spec.ts (drift test).
    '!openapi/generate.ts',
  ],
  coverageDirectory: '../coverage',
  coverageReporters: ['text-summary', 'lcov'],
  // The CI gate: `npm run test:cov` exits non-zero if coverage falls below these numbers.
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 },
  },
};

export default config;
