import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseSchema, type SchemaField, type SchemaModel } from './schema-parser';

// B301 acceptance and the ROADMAP §4 / ARCHITECTURE §4 rules, checked on the real schema.
// A failure here means a table broke a rule that every later ticket relies on.

const schema = parseSchema(
  readFileSync(path.join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8'),
);
const modelNames = new Set(schema.models.map((m) => m.name));
const NOT_TENANT_OWNED = new Set(['Tenant', 'AppEnvironment']);
const tenantOwned = schema.models.filter((m) => !NOT_TENANT_OWNED.has(m.name));
const byName = (name: string): SchemaModel => {
  const model = schema.models.find((m) => m.name === name);
  if (!model) throw new Error(`model ${name} not found`);
  return model;
};
const field = (model: string, name: string): SchemaField => {
  const found = byName(model).fields.find((f) => f.name === name);
  if (!found) throw new Error(`${model}.${name} not found`);
  return found;
};
const relationsOf = (model: SchemaModel): SchemaField[] =>
  model.fields.filter((f) => f.relation?.fields !== undefined);

/** ROADMAP §4 table list, plus branch_stock (ADR 0004). */
const EXPECTED_TABLES = [
  'app_environment',
  'tenants',
  'branches',
  'users',
  'role_permissions',
  'user_permission_overrides',
  'categories',
  'menu_items',
  'menu_item_ingredients',
  'inventory_items',
  'inventory_item_components',
  'branch_stock',
  'inventory_transactions',
  'inventory_snapshots',
  'reconciliation_entries',
  'waste_entries',
  'order_workflow_stages',
  'orders',
  'order_items',
  'order_stage_history',
];

describe('schema: tables', () => {
  it('has exactly the Phase 1 tables', () => {
    expect(schema.models.map((m) => m.dbName).sort()).toEqual([...EXPECTED_TABLES].sort());
  });

  it('maps every model and column to snake_case', () => {
    for (const model of schema.models) {
      expect({ model: model.name, table: model.dbName }).toEqual({
        model: model.name,
        table: expect.stringMatching(/^[a-z][a-z_]*$/) as unknown,
      });
      for (const f of model.fields) {
        if (f.relation || modelNames.has(f.type)) continue;
        const column = f.dbName ?? f.name;
        expect(`${model.name}.${f.name} -> ${column}`).toMatch(/-> [a-z][a-z0-9_]*$/);
      }
    }
  });
});

describe('schema: tenant isolation (rule 1)', () => {
  it.each(tenantOwned.map((m) => [m.name]))('%s has a required uuid tenant_id', (name) => {
    expect(field(name, 'tenantId')).toMatchObject({
      type: 'String',
      optional: false,
      dbName: 'tenant_id',
      nativeType: 'Uuid',
    });
  });

  it.each(tenantOwned.map((m) => [m.name]))(
    '%s is referenceable by (tenant_id, id) so foreign keys can include the tenant',
    (name) => {
      expect(byName(name).uniques).toContainEqual(['tenantId', 'id']);
    },
  );

  /** Global unique keys, each documented in docs/SCHEMA.md. Anything else must lead with tenant_id. */
  const GLOBAL_UNIQUES = new Set([
    // Idempotent deductions: order ids are global uuids (ARCHITECTURE §5).
    'InventoryTransaction:relatedOrderId,inventoryItemId,type',
    // Ledger watermark: one global sequence (snapshots store through_seq).
    'InventoryTransaction:seq',
    // Guest tracking: the token hash is globally unguessable and looked up before the tenant check.
    'Order:trackingTokenHash',
  ]);

  it.each(tenantOwned.map((m) => [m.name]))('%s: every index starts with tenant_id', (name) => {
    const model = byName(name);
    const offenders = [...model.indexes, ...model.uniques]
      .filter((columns) => columns[0] !== 'tenantId')
      .map((columns) => `${name}:${columns.join(',')}`)
      .filter((key) => !GLOBAL_UNIQUES.has(key));
    expect(offenders).toEqual([]);
  });

  it('the global unique keys are exactly the documented ones', () => {
    const found = schema.models.flatMap((m) =>
      m.uniques.filter((u) => u[0] !== 'tenantId').map((u) => `${m.name}:${u.join(',')}`),
    );
    expect(found.filter((k) => !k.startsWith('Tenant:')).sort()).toEqual(
      [...GLOBAL_UNIQUES].sort(),
    );
  });

  it('every foreign key between tenant-owned tables includes tenant_id', () => {
    const offenders: string[] = [];
    for (const model of tenantOwned) {
      for (const rel of relationsOf(model)) {
        const target = rel.type;
        const { fields = [], references = [] } = rel.relation ?? {};
        const ok =
          target === 'Tenant'
            ? fields.length === 1 && fields[0] === 'tenantId' && references[0] === 'id'
            : fields[0] === 'tenantId' && references[0] === 'tenantId';
        if (!ok) offenders.push(`${model.name}.${rel.name} -> ${target}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every tenant-owned table belongs to its tenant through a foreign key', () => {
    for (const model of tenantOwned) {
      expect({
        model: model.name,
        tenantFk: relationsOf(model).some((r) => r.type === 'Tenant'),
      }).toEqual({
        model: model.name,
        tenantFk: true,
      });
    }
  });
});

describe('schema: no hard deletes (rule 5)', () => {
  it('no foreign key cascades or nulls on delete', () => {
    for (const model of schema.models) {
      for (const rel of relationsOf(model)) {
        expect(`${model.name}.${rel.name}: ${rel.relation?.onDelete ?? 'missing'}`).toMatch(
          /: Restrict$/,
        );
      }
    }
  });
});

describe('schema: decimals (rule 4)', () => {
  it('never uses Float', () => {
    const floats = schema.models.flatMap((m) =>
      m.fields.filter((f) => f.type === 'Float').map((f) => `${m.name}.${f.name}`),
    );
    expect(floats).toEqual([]);
  });

  it('gives every Decimal one of the agreed precisions', () => {
    const allowed = ['Decimal(12, 2)', 'Decimal(14, 3)', 'Decimal(14, 4)'];
    for (const model of schema.models) {
      for (const f of model.fields.filter((x) => x.type === 'Decimal')) {
        expect(`${model.name}.${f.name} ${f.nativeType ?? 'none'}`).toMatch(
          new RegExp(` (${allowed.map((a) => a.replace(/[()]/g, '\\$&')).join('|')})$`),
        );
      }
    }
  });

  it.each([
    ['MenuItem', 'price', 'Decimal(12, 2)'],
    ['Order', 'total', 'Decimal(12, 2)'],
    ['OrderItem', 'unitPrice', 'Decimal(12, 2)'],
    ['BranchStock', 'currentStock', 'Decimal(14, 3)'],
    ['InventoryTransaction', 'quantityDelta', 'Decimal(14, 3)'],
    ['InventoryTransaction', 'unitCost', 'Decimal(14, 4)'],
    ['BranchStock', 'avgUnitCost', 'Decimal(14, 4)'],
    ['InventoryItem', 'standardUnitCost', 'Decimal(14, 4)'],
  ])('%s.%s is %s', (model, name, nativeType) => {
    expect(field(model, name)).toMatchObject({ type: 'Decimal', nativeType });
  });
});

describe('schema: timestamps and keys', () => {
  it.each(schema.models.filter((m) => m.name !== 'AppEnvironment').map((m) => [m.name]))(
    '%s has a uuid id, created_at and updated_at',
    (name) => {
      expect(field(name, 'id')).toMatchObject({ type: 'String', nativeType: 'Uuid' });
      expect(field(name, 'createdAt')).toMatchObject({ type: 'DateTime', dbName: 'created_at' });
      expect(field(name, 'updatedAt')).toMatchObject({ type: 'DateTime', dbName: 'updated_at' });
    },
  );
});

describe('schema: decisions from the ADRs', () => {
  it('ledger idempotency key on (related_order_id, inventory_item_id, type) (ARCHITECTURE §5)', () => {
    expect(byName('InventoryTransaction').uniques).toContainEqual([
      'relatedOrderId',
      'inventoryItemId',
      'type',
    ]);
  });

  it('stock lives in branch_stock per (branch, item) (ADR 0004)', () => {
    expect(byName('BranchStock').uniques).toContainEqual([
      'tenantId',
      'branchId',
      'inventoryItemId',
    ]);
    expect(byName('InventoryItem').fields.map((f) => f.name)).not.toContain('currentStock');
  });

  it('menu items may be offered at every branch (branch_id NULL) (ADR 0004)', () => {
    expect(field('MenuItem', 'branchId').optional).toBe(true);
  });

  it.each([
    'Order',
    'InventoryTransaction',
    'InventorySnapshot',
    'WasteEntry',
    'ReconciliationEntry',
  ])('%s carries a required branch_id (ADR 0004)', (name) => {
    expect(field(name, 'branchId').optional).toBe(false);
  });

  it('cost columns exist (ADR 0005)', () => {
    expect(field('InventoryTransaction', 'unitCost').optional).toBe(true);
    expect(field('BranchStock', 'avgUnitCost').optional).toBe(true);
    expect(field('InventoryItem', 'standardUnitCost').optional).toBe(true);
  });

  it('units are an enum with exactly G, KG, ML, L, PCS (ADR 0003)', () => {
    expect(schema.enums.find((e) => e.name === 'Unit')?.values).toEqual([
      'G',
      'KG',
      'ML',
      'L',
      'PCS',
    ]);
    for (const [model, name] of [
      ['InventoryItem', 'unit'],
      ['MenuItemIngredient', 'unit'],
      ['InventoryItemComponent', 'unit'],
    ] as const) {
      expect(field(model, name).type).toBe('Unit');
    }
  });

  it('users may have no branch (ADMIN) and demo users are flagged (ADR 0007)', () => {
    expect(field('User', 'branchId').optional).toBe(true);
    expect(field('User', 'isDemo').type).toBe('Boolean');
    expect(field('Tenant', 'slug').attributes).toContain('@unique');
  });

  it('guest orders store only a tracking token hash, unique (ADR 0008)', () => {
    expect(field('Order', 'trackingTokenHash')).toMatchObject({ optional: true });
    expect(field('Order', 'trackingTokenHash').attributes).toContain('@unique');
  });

  it('orders reference their stage by (tenant_id, stage_key), renames cascade (ADR 0009)', () => {
    expect(field('Order', 'stage').relation).toMatchObject({
      fields: ['tenantId', 'stageKey'],
      references: ['tenantId', 'key'],
      onUpdate: 'Cascade',
    });
    expect(byName('OrderWorkflowStage').uniques).toEqual(
      expect.arrayContaining([
        ['tenantId', 'key'],
        ['tenantId', 'position'],
      ]),
    );
  });

  it('stage behavior is data: cancellable and deducts_inventory flags (rule 2)', () => {
    expect(field('OrderWorkflowStage', 'cancellable').type).toBe('Boolean');
    expect(field('OrderWorkflowStage', 'deductsInventory').type).toBe('Boolean');
    expect(field('OrderWorkflowStage', 'position').type).toBe('Int');
  });

  it('order items copy name and unit price at order time (ARCHITECTURE §4)', () => {
    expect(field('OrderItem', 'name').type).toBe('String');
    expect(field('OrderItem', 'unitPrice').type).toBe('Decimal');
  });

  it('transaction types and roles match the roadmap', () => {
    expect(schema.enums.find((e) => e.name === 'InventoryTransactionType')?.values).toEqual([
      'PURCHASE',
      'CONSUMPTION',
      'WASTE',
      'TRANSFER',
      'ADJUSTMENT',
    ]);
    expect(schema.enums.find((e) => e.name === 'UserRole')?.values).toEqual([
      'ADMIN',
      'MANAGER',
      'WORKER',
    ]);
    expect(schema.enums.find((e) => e.name === 'PlacedByType')?.values).toEqual([
      'STAFF',
      'CUSTOMER',
      'GUEST',
    ]);
    expect(schema.enums.find((e) => e.name === 'InventoryItemType')?.values).toEqual([
      'RAW',
      'READY',
      'MIXED',
    ]);
  });

  it('is_combo is reserved on menu items (ARCHITECTURE §1)', () => {
    expect(field('MenuItem', 'isCombo').type).toBe('Boolean');
  });
});

describe('schema: time zones', () => {
  it('stores every timestamp as timestamptz (reports group by the tenant local day)', () => {
    const offenders = schema.models.flatMap((m) =>
      m.fields
        .filter((f) => f.type === 'DateTime' && f.nativeType !== 'Timestamptz(3)')
        .map((f) => `${m.name}.${f.name}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe('schema: access-path indexes', () => {
  it.each([
    ['Order', ['tenantId', 'branchId', 'stageKey', 'createdAt'], 'board: orders by stage'],
    ['Order', ['tenantId', 'branchId', 'updatedAt'], 'polling with updatedSince (B802)'],
    ['Order', ['tenantId', 'branchId', 'createdAt'], 'orders by date (reports)'],
    ['Order', ['tenantId', 'stageKey'], 'stage rename / delete checks'],
    [
      'InventoryTransaction',
      ['tenantId', 'branchId', 'inventoryItemId', 'seq'],
      'ledger by item in order',
    ],
    [
      'InventoryTransaction',
      ['tenantId', 'branchId', 'inventoryItemId', 'createdAt'],
      'ledger by item and time',
    ],
    [
      'InventorySnapshot',
      ['tenantId', 'branchId', 'inventoryItemId', 'throughSeq'],
      'latest snapshot',
    ],
    ['WasteEntry', ['tenantId', 'branchId', 'inventoryItemId', 'createdAt'], 'waste per item'],
    ['User', ['tenantId', 'branchId'], 'staff per branch'],
  ])('%s has an index on %j (%s)', (model, columns) => {
    expect([...byName(model).indexes, ...byName(model).uniques]).toContainEqual(columns);
  });
});
