// @ts-check
import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'eslint.config.mjs',
      '.claude/**',
      'src/generated/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  prettierConfig,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // CLAUDE.md rule 1 / ARCHITECTURE §3: feature modules reach the database only through the
    // tenant-scoped client (TENANT_DB from src/prisma/tenant-prisma.ts). Types and enums are fine.
    files: ['src/modules/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'MemberExpression[property.name=/^\\$(queryRaw|executeRaw|queryRawUnsafe|executeRawUnsafe)$/]',
          message: 'Raw SQL bypasses the tenant scope (ADR 0015). Use TENANT_DB model queries.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/prisma/prisma.service', '**/prisma/prisma.module'],
              message: 'Feature code uses the tenant-scoped client: inject TENANT_DB instead.',
            },
            {
              group: ['**/generated/prisma/client'],
              allowTypeImports: true,
              message:
                'Feature code must not build its own PrismaClient: inject TENANT_DB (type imports are fine).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
);
