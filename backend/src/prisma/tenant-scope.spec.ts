import { scopeQueryArgs, TenantScopeError } from './tenant-scope';

// CLAUDE.md rule 1: the tenant-scoped client adds tenant_id to every query and write.
// The real-database proof is test/tenant-scope.e2e-spec.ts; this pins the rewriting itself.

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

describe('scopeQueryArgs: filters', () => {
  it.each([
    'findUnique',
    'findUniqueOrThrow',
    'findFirst',
    'findFirstOrThrow',
    'findMany',
    'update',
    'updateMany',
    'updateManyAndReturn',
    'count',
    'aggregate',
    'groupBy',
  ])('%s gets tenant_id added to its where, keeping the original filter', (operation) => {
    const scoped = scopeQueryArgs(
      'Category',
      operation,
      { where: { id: 'x', AND: { name: 'y' } } },
      A,
    );
    expect(scoped.where).toEqual({ id: 'x', AND: [{ name: 'y' }, { tenantId: A }] });
  });

  it('adds a where when the query has none', () => {
    expect(scopeQueryArgs('Category', 'findMany', {}, A).where).toEqual({
      AND: [{ tenantId: A }],
    });
    expect(scopeQueryArgs('Category', 'count', undefined, A).where).toEqual({
      AND: [{ tenantId: A }],
    });
  });

  it('cannot be undone by a where that names another tenant', () => {
    const scoped = scopeQueryArgs('Category', 'findMany', { where: { tenantId: B } }, A);
    // Both conditions must hold, so another tenant's rows never match.
    expect(scoped.where).toEqual({ tenantId: B, AND: [{ tenantId: A }] });
  });

  it('scopes the tenants table by its own id', () => {
    expect(scopeQueryArgs('Tenant', 'findUnique', { where: { slug: 's' } }, A).where).toEqual({
      slug: 's',
      AND: [{ id: A }],
    });
  });
});

describe('scopeQueryArgs: writes', () => {
  it('sets tenant_id on create', () => {
    expect(scopeQueryArgs('Category', 'create', { data: { name: 'Pizza' } }, A).data).toEqual({
      name: 'Pizza',
      tenantId: A,
    });
  });

  it.each(['createMany', 'createManyAndReturn'])('sets tenant_id on every %s row', (op) => {
    const scoped = scopeQueryArgs('Category', op, { data: [{ name: 'a' }, { name: 'b' }] }, A);
    expect(scoped.data).toEqual([
      { name: 'a', tenantId: A },
      { name: 'b', tenantId: A },
    ]);
    expect(scopeQueryArgs('Category', op, { data: { name: 'a' } }, A).data).toEqual([
      { name: 'a', tenantId: A },
    ]);
  });

  it('connects the tenant relation when the data uses relation fields', () => {
    const data = { name: 'Pizza', tenant: { connect: { id: A } } };
    expect(scopeQueryArgs('Category', 'create', { data }, A).data).toEqual(data);
    expect(
      scopeQueryArgs('Category', 'create', { data: { name: 'x', tenant: {} } }, A).data,
    ).toEqual({ name: 'x', tenant: { connect: { id: A } } });
  });

  it('scopes upsert: where, create data and update data', () => {
    const scoped = scopeQueryArgs(
      'Category',
      'upsert',
      { where: { id: 'x' }, create: { name: 'a' }, update: { name: 'b' } },
      A,
    );
    expect(scoped).toEqual({
      where: { id: 'x', AND: [{ tenantId: A }] },
      create: { name: 'a', tenantId: A },
      update: { name: 'b' },
    });
  });

  it.each([
    ['create', { data: { name: 'a', tenantId: B } }],
    [
      'createMany',
      {
        data: [
          { name: 'a', tenantId: A },
          { name: 'b', tenantId: B },
        ],
      },
    ],
    ['create', { data: { name: 'a', tenant: { connect: { id: B } } } }],
    ['update', { where: { id: 'x' }, data: { tenantId: B } }],
    ['updateMany', { where: {}, data: { tenantId: B } }],
    ['upsert', { where: { id: 'x' }, create: { tenantId: B }, update: {} }],
    ['upsert', { where: { id: 'x' }, create: {}, update: { tenantId: B } }],
  ])('refuses %s that writes another tenant (%j)', (operation, args) => {
    expect(() => scopeQueryArgs('Category', operation, args, A)).toThrow(TenantScopeError);
  });

  it('allows writing the same tenant id explicitly', () => {
    expect(
      scopeQueryArgs('Category', 'create', { data: { name: 'a', tenantId: A } }, A).data,
    ).toEqual({ name: 'a', tenantId: A });
  });
});

describe('scopeQueryArgs: tables outside the tenant', () => {
  it.each([
    'create',
    'createMany',
    'upsert',
    'update',
    'updateMany',
    'updateManyAndReturn',
    'delete',
    'deleteMany',
  ])('refuses %s on tenants (read-only from a tenant request)', (operation) => {
    expect(() => scopeQueryArgs('Tenant', operation, { data: {} }, A)).toThrow(TenantScopeError);
  });

  it.each(['findMany', 'update', 'create'])('refuses %s on app_environment', (operation) => {
    expect(() => scopeQueryArgs('AppEnvironment', operation, {}, A)).toThrow(TenantScopeError);
  });

  it('refuses an operation it does not know, rather than letting it through unscoped', () => {
    expect(() => scopeQueryArgs('Category', 'somethingNew', {}, A)).toThrow(/somethingNew/);
  });
});

describe('scopeQueryArgs: no hard deletes (CLAUDE.md rule 5)', () => {
  it.each([
    ['Category', 'delete'],
    ['Category', 'deleteMany'],
    ['MenuItem', 'deleteMany'],
    ['InventoryTransaction', 'delete'],
    ['Order', 'deleteMany'],
    ['InventoryItemComponent', 'deleteMany'],
  ])('refuses %s.%s', (model, operation) => {
    expect(() => scopeQueryArgs(model, operation, { where: { id: 'x' } }, A)).toThrow(
      /archive or deactivate/,
    );
  });

  it.each(['delete', 'deleteMany'])(
    'allows %s on recipe lines only, still scoped to the tenant (ADR 0019)',
    (operation) => {
      expect(
        scopeQueryArgs('MenuItemIngredient', operation, { where: { menuItemId: 'm' } }, A).where,
      ).toEqual({ menuItemId: 'm', AND: [{ tenantId: A }] });
    },
  );
});

describe('scopeQueryArgs: nested relation writes', () => {
  // A nested connect on a one-to-many relation writes the parent's key (tenant_id included)
  // onto the child, so it could pull another tenant's row in. The scoped client refuses them.
  it.each([
    ['update', { where: { id: 'c' }, data: { menuItems: { connect: { id: 'm' } } } }],
    ['update', { where: { id: 'c' }, data: { menuItems: { set: [] } } }],
    ['update', { where: { id: 'c' }, data: { menuItems: { disconnect: { id: 'm' } } } }],
    [
      'update',
      { where: { id: 'c' }, data: { menuItems: { updateMany: { where: {}, data: {} } } } },
    ],
    ['create', { data: { name: 'a', menuItems: { create: [{ name: 'x' }] } } }],
    ['create', { data: { name: 'a', menuItems: { connectOrCreate: { where: {}, create: {} } } } }],
    ['createMany', { data: [{ name: 'a', menuItems: { connect: [{ id: 'm' }] } }] }],
    ['upsert', { where: { id: 'c' }, create: {}, update: { menuItems: { connect: { id: 'm' } } } }],
    ['upsert', { where: { id: 'c' }, create: { menuItems: { create: {} } }, update: {} }],
  ])('refuses a nested write in %s (%j)', (operation, args) => {
    expect(() => scopeQueryArgs('Category', operation, args, A)).toThrow(/nested relation write/);
  });

  it('still allows scalar update operators and plain values', () => {
    const data = {
      name: { set: 'Pizza' },
      position: { increment: 1 },
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      isActive: false,
    };
    expect(scopeQueryArgs('Category', 'update', { where: { id: 'c' }, data }, A).data).toEqual(
      data,
    );
  });
});
