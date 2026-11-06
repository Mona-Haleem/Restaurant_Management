import type { PrismaClient } from '../src/generated/prisma/client';
import { RequestContextStore } from '../src/context/request-context.store';
import { createTenantClient, type TenantDb } from '../src/prisma/tenant-prisma';
import { TenantScopeError } from '../src/prisma/tenant-scope';
import { ensureSeedTenants, unscopedClient, type SeedTenants } from './seed-tenants';

// B503 / CLAUDE.md rule 1, on real Postgres: the tenant-scoped client only ever sees and writes
// the tenant of the current request context, whatever ids the caller passes.

describe('tenant-scoped Prisma client', () => {
  let prisma: PrismaClient;
  let db: TenantDb;
  let seed: SeedTenants;
  const store = new RequestContextStore();
  let A: string;
  let B: string;

  const as = <T>(tenantId: string, fn: () => Promise<T>): Promise<T> =>
    store.run(
      {
        tenantId,
        tenantSlug: '-',
        tenantName: '-',
        isDemoTenant: true,
        branchId: null,
        actor: null,
      },
      // Await inside the context: Prisma queries are lazy and run when awaited (see tenant-prisma.ts).
      async () => await fn(),
    );

  beforeAll(async () => {
    prisma = unscopedClient();
    seed = await ensureSeedTenants(prisma);
    A = seed.a.tenant.id;
    B = seed.b.tenant.id;
    db = createTenantClient(prisma, () => store.require().tenantId);
  });
  afterAll(() => prisma.$disconnect());

  it("cannot read another tenant's row by id", async () => {
    expect(
      await as(A, () => db.category.findUnique({ where: { id: seed.bCategoryId } })),
    ).toBeNull();
    expect(
      await as(A, () => db.category.findFirst({ where: { id: seed.bCategoryId } })),
    ).toBeNull();
    expect(
      await as(B, () => db.category.findUnique({ where: { id: seed.bCategoryId } })),
    ).not.toBeNull();
  });

  it('lists and counts only its own rows', async () => {
    const rows = await as(A, () => db.category.findMany({ select: { id: true, tenantId: true } }));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => r.tenantId !== A)).toEqual([]);
    expect(await as(A, () => db.category.count())).toBe(
      await prisma.category.count({ where: { tenantId: A } }),
    );
    expect(await as(A, () => db.category.count({ where: { tenantId: B } }))).toBe(0);
  });

  it("cannot update another tenant's row", async () => {
    await expect(
      as(A, () =>
        db.category.update({ where: { id: seed.bCategoryId }, data: { name: 'Hacked' } }),
      ),
    ).rejects.toMatchObject({ code: 'P2025' });
    const many = await as(A, () =>
      db.category.updateMany({ where: { id: seed.bCategoryId }, data: { name: 'Hacked' } }),
    );
    expect(many.count).toBe(0);
    expect((await prisma.category.findUnique({ where: { id: seed.bCategoryId } }))?.name).toBe(
      'Seafood (tenant B)',
    );
  });

  it('writes new rows into the context tenant, and refuses rows for another tenant', async () => {
    const created = await as(A, () =>
      db.category.create({ data: { tenantId: A, name: `Specials ${Date.now()}` } }),
    );
    expect(created.tenantId).toBe(A);
    // Prisma's types require tenantId; at runtime the extension fills it in when it is missing.
    const filled = await as(A, () =>
      db.category.create({
        data: { name: `Filled ${Date.now()}` } as { name: string; tenantId: string },
      }),
    );
    expect(filled.tenantId).toBe(A);
    const before = await prisma.category.count({ where: { tenantId: B } });
    await expect(
      as(A, () => db.category.create({ data: { tenantId: B, name: 'Sneaky' } })),
    ).rejects.toBeInstanceOf(TenantScopeError);
    expect(await prisma.category.count({ where: { tenantId: B } })).toBe(before);
  });

  it("cannot pull another tenant's row in through a nested relation write", async () => {
    await expect(
      as(A, () =>
        db.tenant.update({
          where: { id: A },
          data: { categories: { connect: { id: seed.bCategoryId } } },
        }),
      ),
    ).rejects.toBeInstanceOf(TenantScopeError);
    const aCategory = seed.a.categories[0]!.id;
    await expect(
      as(A, () =>
        db.category.update({
          where: { id: aCategory },
          data: { menuItems: { connect: [{ id: seed.a.menuItems[0]!.id }] } },
        }),
      ),
    ).rejects.toThrow(/nested relation write/);
    const bRow = await prisma.category.findUnique({ where: { id: seed.bCategoryId } });
    expect(bRow?.tenantId).toBe(B);
  });

  it('refuses hard deletes (CLAUDE.md rule 5)', async () => {
    const aCategory = seed.a.categories[0]!.id;
    await expect(as(A, () => db.category.delete({ where: { id: aCategory } }))).rejects.toThrow(
      /no hard deletes/,
    );
    expect(await prisma.category.findUnique({ where: { id: aCategory } })).not.toBeNull();
  });

  it('sees only its own tenant in the tenants table', async () => {
    expect(await as(A, () => db.tenant.findUnique({ where: { id: B } }))).toBeNull();
    const tenants = await as(A, () => db.tenant.findMany({ select: { id: true } }));
    expect(tenants).toEqual([{ id: A }]);
  });

  it('stays scoped inside an interactive transaction', async () => {
    const found = await as(A, () =>
      db.$transaction((tx) => tx.category.findUnique({ where: { id: seed.bCategoryId } })),
    );
    expect(found).toBeNull();
  });

  it('refuses to run a query with no request context', async () => {
    await expect(db.category.findMany()).rejects.toThrow(/no request context/);
  });
});
