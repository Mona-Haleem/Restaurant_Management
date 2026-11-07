// The CI database step (B1202, ADR 0029): `npm run db:deploy`, run by the deploy workflows before
// anything is built. Staging and production only; needs APP_ENV and DIRECT_URL (session pooler).
// A deployed APP_ENV reads no env file (ADR 0028), so CI must set both.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { prismaMarkerStore } from '../config/boot-guard';
import type { EnvironmentMarkerStore } from '../config/database-environment';
import {
  assertDatabaseUrlAllowed,
  EnvironmentGuardError,
  parseAppEnv,
} from '../config/environment';
import { deployDatabase } from './database-deploy';

/** Prisma's "table does not exist": a fresh database has no app_environment table yet. */
const TABLE_MISSING = 'P2021';

/** The marker store, reading a database without the table as "no marker". */
function freshAwareStore(prisma: PrismaClient): EnvironmentMarkerStore {
  const store = prismaMarkerStore(prisma);
  return {
    async read() {
      try {
        return await store.read();
      } catch (error) {
        if ((error as { code?: unknown }).code === TABLE_MISSING) return null;
        throw error;
      }
    },
    claim: (appEnv) => store.claim(appEnv),
  };
}

/** `prisma migrate deploy` through the CLI, so prisma.config.ts and its guards apply. */
function migrateDeploy(): Promise<void> {
  // backend/node_modules, from backend/dist/deploy: the installed CLI, never a download.
  const cli = path.join(__dirname, '..', '..', 'node_modules', 'prisma', 'build', 'index.js');
  const result = spawnSync(process.execPath, [cli, 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    return Promise.reject(
      new Error(`prisma migrate deploy failed (exit ${String(result.status)}); nothing deployed.`),
    );
  }
  return Promise.resolve();
}

async function main(): Promise<void> {
  const appEnv = parseAppEnv(process.env.APP_ENV);
  const url = process.env.DIRECT_URL;
  assertDatabaseUrlAllowed(appEnv, url, 'DIRECT_URL');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const result = await deployDatabase({
      appEnv,
      store: freshAwareStore(prisma),
      migrate: migrateDeploy,
    });
    process.stdout.write(
      result === 'claimed'
        ? `Migrated and marked this database as ${appEnv}.\n`
        : `Migrated the ${appEnv} database.\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof EnvironmentGuardError ? error.message : String(error);
  process.stderr.write(`\n✖ Database step failed: ${message}\n\n`);
  process.exit(1);
});
