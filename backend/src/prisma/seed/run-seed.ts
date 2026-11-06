// Seeds the demo tenants (B401). Run with `npm run db:seed`; local and test databases only.
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { prismaMarkerStore } from '../../config/boot-guard';
import { assertDatabaseEnvironment } from '../../config/database-environment';
import { EnvironmentGuardError } from '../../config/environment';
import { loadEnvFiles } from '../../config/load-env';
import { buildTenantSeed } from './build-seed';
import { SEED_TENANTS } from './demo-data';
import { assertSeedAllowed } from './seed-guard';
import { writeTenantSeed } from './write-seed';

async function main(): Promise<void> {
  loadEnvFiles(path.join(__dirname, '..', '..', '..'));
  const appEnv = assertSeedAllowed(process.env);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    // The database's own marker must agree with APP_ENV (ADR 0011), as at API boot.
    await assertDatabaseEnvironment(prismaMarkerStore(prisma), appEnv);
    const now = new Date();
    for (const definition of SEED_TENANTS) {
      const seed = buildTenantSeed(definition, now);
      await prisma.$transaction((tx) => writeTenantSeed(tx, seed), { timeout: 60_000 });
      process.stdout.write(
        `Seeded ${seed.tenant.slug}: ${seed.menuItems.length} menu items, ` +
          `${seed.inventoryItems.length} inventory items, ${seed.orders.length} orders ` +
          '(existing rows are left as they are).\n',
      );
      for (const { orderKey, token } of seed.trackingTokens) {
        process.stdout.write(`  track ${orderKey}: /v1/${seed.tenant.slug}/track/${token}\n`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof EnvironmentGuardError ? error.message : String(error);
  process.stderr.write(`\n✖ Seed failed: ${message}\n\n`);
  process.exit(1);
});
