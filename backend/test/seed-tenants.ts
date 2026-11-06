import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { buildTenantSeed, type TenantSeed } from '../src/prisma/seed/build-seed';
import { DEMO_TENANT, SECOND_TENANT } from '../src/prisma/seed/demo-data';
import { seedId } from '../src/prisma/seed/seed-ids';
import { writeTenantSeed } from '../src/prisma/seed/write-seed';
import { TEST_DATABASE_URL } from './test-env';

export interface SeedTenants {
  /** nile-bites: the demo tenant (writable). */
  a: TenantSeed;
  /** harbor-grill: the second tenant (read-only in Phase 1). */
  b: TenantSeed;
  /** A category that belongs to tenant B, so there is a B row to aim at. */
  bCategoryId: string;
}

export function unscopedClient(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL }) });
}

/** Makes sure both seed tenants (B401) exist in tablz_test, plus one category for tenant B. */
export async function ensureSeedTenants(prisma: PrismaClient): Promise<SeedTenants> {
  const now = new Date();
  const a = buildTenantSeed(DEMO_TENANT, now);
  const b = buildTenantSeed(SECOND_TENANT, now);
  for (const seed of [a, b]) {
    await prisma.$transaction((tx) => writeTenantSeed(tx, seed), { timeout: 60_000 });
  }
  const bCategoryId = seedId(SECOND_TENANT.slug, 'categories', 'isolation-target');
  await prisma.category.createMany({
    data: [{ id: bCategoryId, tenantId: b.tenant.id, name: 'Seafood (tenant B)' }],
    skipDuplicates: true,
  });
  return { a, b, bCategoryId };
}
