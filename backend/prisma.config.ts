// Prisma CLI configuration. Loaded by every `prisma` command before it touches a database,
// which makes it the one place that can refuse destructive commands outside local/test.
import { defineConfig } from 'prisma/config';
import { assertPrismaCommandAllowed, EnvironmentGuardError } from './src/config/environment';
import { envFileHint, loadEnvFiles } from './src/config/load-env';

const hint = envFileHint(loadEnvFiles(__dirname), process.env);
if (hint) process.stderr.write(`\n! ${hint}\n`);

try {
  assertPrismaCommandAllowed(process.argv.slice(2), process.env);
} catch (error) {
  if (error instanceof EnvironmentGuardError) {
    process.stderr.write(`\n✖ ${error.message}\n\n`);
    process.exit(1);
  }
  throw error;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Migrations use the direct/session connection; the running app uses DATABASE_URL.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || '',
  },
});
