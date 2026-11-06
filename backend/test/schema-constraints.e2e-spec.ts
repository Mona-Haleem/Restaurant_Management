import { randomUUID } from 'node:crypto';
import { Client, DatabaseError } from 'pg';
import { TEST_DATABASE_URL } from './test-env';

// B301: the database itself enforces the schema rules. Every hand-written CHECK rejects a row
// that breaks it (each case breaks exactly one rule), and the composite tenant foreign keys,
// the idempotency key and Restrict deletes hold. Raw SQL on purpose: this tests the database,
// not the application.

type Ids = Record<string, string>;

/** Inserts one complete, valid row graph for a tenant and returns the ids. */
async function seedTenant(db: Client, slug: string): Promise<Ids> {
  const id: Ids = {};
  for (const key of [
    'tenant',
    'branch',
    'admin',
    'worker',
    'category',
    'raw',
    'mixed',
    'component',
    'menuItem',
    'ingredient',
    'stock',
    'stagePending',
    'stageSpare',
    'order',
    'orderItem',
    'purchase',
    'adjustment',
    'consumption',
    'wasteTxn',
    'waste',
    'snapshot',
    'reconciliation',
    'placed',
    'advanced',
  ]) {
    id[key] = randomUUID();
  }
  const q = (sql: string, values: unknown[]): Promise<unknown> => db.query(sql, values);
  const t = id.tenant;

  await q(
    `INSERT INTO tenants (id, slug, name, timezone, updated_at) VALUES ($1, $2, $2, 'Africa/Cairo', now())`,
    [t, slug],
  );
  await q(`INSERT INTO branches (id, tenant_id, name, updated_at) VALUES ($1, $2, 'Main', now())`, [
    id.branch,
    t,
  ]);
  await q(
    `INSERT INTO users (id, tenant_id, name, role, updated_at) VALUES ($1, $2, 'Admin', 'ADMIN', now())`,
    [id.admin, t],
  );
  await q(
    `INSERT INTO users (id, tenant_id, branch_id, name, role, updated_at) VALUES ($1, $2, $3, 'Worker', 'WORKER', now())`,
    [id.worker, t, id.branch],
  );
  await q(
    `INSERT INTO categories (id, tenant_id, name, updated_at) VALUES ($1, $2, 'Mains', now())`,
    [id.category, t],
  );
  await q(
    `INSERT INTO inventory_items (id, tenant_id, name, type, unit, standard_unit_cost, updated_at) VALUES ($1, $2, 'Flour', 'RAW', 'KG', 1.5, now())`,
    [id.raw, t],
  );
  await q(
    `INSERT INTO inventory_items (id, tenant_id, name, type, unit, updated_at) VALUES ($1, $2, 'Dough', 'MIXED', 'KG', now())`,
    [id.mixed, t],
  );
  await q(
    `INSERT INTO inventory_item_components (id, tenant_id, mixed_item_id, component_item_id, quantity, unit, updated_at) VALUES ($1, $2, $3, $4, 0.6, 'KG', now())`,
    [id.component, t, id.mixed, id.raw],
  );
  await q(
    `INSERT INTO menu_items (id, tenant_id, category_id, name, price, updated_at) VALUES ($1, $2, $3, 'Pizza', 120.00, now())`,
    [id.menuItem, t, id.category],
  );
  await q(
    `INSERT INTO menu_item_ingredients (id, tenant_id, menu_item_id, inventory_item_id, quantity, unit, updated_at) VALUES ($1, $2, $3, $4, 250, 'G', now())`,
    [id.ingredient, t, id.menuItem, id.raw],
  );
  await q(
    `INSERT INTO branch_stock (id, tenant_id, branch_id, inventory_item_id, current_stock, low_stock_threshold, avg_unit_cost, updated_at) VALUES ($1, $2, $3, $4, 10, 2, 1.5, now())`,
    [id.stock, t, id.branch, id.raw],
  );
  await q(
    `INSERT INTO order_workflow_stages (id, tenant_id, key, label, position, cancellable, deducts_inventory, updated_at) VALUES ($1, $2, 'pending', 'Pending', 1, true, false, now())`,
    [id.stagePending, t],
  );
  await q(
    `INSERT INTO order_workflow_stages (id, tenant_id, key, label, position, cancellable, deducts_inventory, updated_at) VALUES ($1, $2, 'delivered', 'Delivered', 2, false, true, now())`,
    [id.stageSpare, t],
  );
  await q(
    `INSERT INTO orders (id, tenant_id, branch_id, stage_key, placed_by_type, total, tracking_token_hash, updated_at) VALUES ($1, $2, $3, 'pending', 'GUEST', 240.00, $4, now())`,
    [id.order, t, id.branch, `hash-${id.order}`],
  );
  await q(
    `INSERT INTO order_items (id, tenant_id, order_id, menu_item_id, name, unit_price, quantity, line_total, updated_at) VALUES ($1, $2, $3, $4, 'Pizza', 120.00, 2, 240.00, now())`,
    [id.orderItem, t, id.order, id.menuItem],
  );
  const txn = `INSERT INTO inventory_transactions (id, tenant_id, branch_id, inventory_item_id, type, quantity_delta, unit_cost, related_order_id, actor_id, updated_at) VALUES ($1, $2, $3, $4, $5, $6, 1.5, $7, $8, now())`;
  await q(txn, [id.purchase, t, id.branch, id.raw, 'PURCHASE', 12, null, id.admin]);
  await q(txn, [id.adjustment, t, id.branch, id.raw, 'ADJUSTMENT', 1, null, id.admin]);
  await q(txn, [id.consumption, t, id.branch, id.raw, 'CONSUMPTION', -0.5, id.order, id.worker]);
  await q(txn, [id.wasteTxn, t, id.branch, id.raw, 'WASTE', -0.25, null, id.worker]);
  await q(
    `INSERT INTO waste_entries (id, tenant_id, branch_id, inventory_item_id, quantity, unit, reason, transaction_id, actor_id, updated_at) VALUES ($1, $2, $3, $4, 250, 'G', 'Dropped', $5, $6, now())`,
    [id.waste, t, id.branch, id.raw, id.wasteTxn, id.worker],
  );
  await q(
    `INSERT INTO inventory_snapshots (id, tenant_id, branch_id, inventory_item_id, quantity, through_seq, updated_at) VALUES ($1, $2, $3, $4, 12.25, 0, now())`,
    [id.snapshot, t, id.branch, id.raw],
  );
  await q(
    `INSERT INTO reconciliation_entries (id, tenant_id, branch_id, inventory_item_id, counted_quantity, expected_quantity, gap, snapshot_id, actor_id, updated_at) VALUES ($1, $2, $3, $4, 12.25, 12.25, 0, $5, $6, now())`,
    [id.reconciliation, t, id.branch, id.raw, id.snapshot, id.admin],
  );
  const history = `INSERT INTO order_stage_history (id, tenant_id, order_id, action, from_stage_key, to_stage_key, updated_at) VALUES ($1, $2, $3, $4, $5, $6, now())`;
  await q(history, [id.placed, t, id.order, 'PLACED', null, 'pending']);
  await q(history, [id.advanced, t, id.order, 'ADVANCED', 'pending', 'delivered']);
  return id;
}

describe('schema constraints (real Postgres)', () => {
  const db = new Client({ connectionString: TEST_DATABASE_URL });
  let a: Ids;
  let b: Ids;

  beforeAll(async () => {
    await db.connect();
    a = await seedTenant(db, `tenant-a-${Date.now()}`);
    b = await seedTenant(db, `tenant-b-${Date.now()}`);
  });
  afterAll(() => db.end());

  /** Runs `sql` in a transaction that is always rolled back; returns the Postgres error. */
  async function attempt(sql: string, values: unknown[] = []): Promise<DatabaseError | null> {
    await db.query('BEGIN');
    try {
      await db.query(sql, values);
      return null;
    } catch (error) {
      if (error instanceof DatabaseError) return error;
      throw error;
    } finally {
      await db.query('ROLLBACK');
    }
  }

  async function expectCheck(constraint: string, sql: string, values: unknown[]): Promise<void> {
    const error = await attempt(sql, values);
    expect({ code: error?.code, constraint: error?.constraint }).toEqual({
      code: '23514',
      constraint,
    });
  }

  // [constraint, statement that breaks only that rule, parameter names from tenant A]
  const CASES: [string, string, string[]][] = [
    ['tenants_slug_format', `UPDATE tenants SET slug = 'Not A Slug' WHERE id = $1`, ['tenant']],
    [
      'users_branch_required_unless_admin',
      `UPDATE users SET branch_id = NULL WHERE id = $1`,
      ['worker'],
    ],
    [
      'menu_items_price_non_negative',
      `UPDATE menu_items SET price = -0.01 WHERE id = $1`,
      ['menuItem'],
    ],
    [
      'menu_items_no_combos_in_phase_1',
      `UPDATE menu_items SET is_combo = true WHERE id = $1`,
      ['menuItem'],
    ],
    [
      'menu_item_ingredients_quantity_positive',
      `UPDATE menu_item_ingredients SET quantity = 0 WHERE id = $1`,
      ['ingredient'],
    ],
    [
      'inventory_items_standard_unit_cost_non_negative',
      `UPDATE inventory_items SET standard_unit_cost = -1 WHERE id = $1`,
      ['raw'],
    ],
    [
      'inventory_item_components_quantity_positive',
      `UPDATE inventory_item_components SET quantity = 0 WHERE id = $1`,
      ['component'],
    ],
    [
      'inventory_item_components_not_self',
      `UPDATE inventory_item_components SET component_item_id = mixed_item_id WHERE id = $1`,
      ['component'],
    ],
    [
      'branch_stock_low_stock_threshold_non_negative',
      `UPDATE branch_stock SET low_stock_threshold = -1 WHERE id = $1`,
      ['stock'],
    ],
    [
      'branch_stock_avg_unit_cost_non_negative',
      `UPDATE branch_stock SET avg_unit_cost = -1 WHERE id = $1`,
      ['stock'],
    ],
    [
      'inventory_transactions_delta_non_zero',
      `UPDATE inventory_transactions SET quantity_delta = 0 WHERE id = $1`,
      ['adjustment'],
    ],
    [
      'inventory_transactions_unit_cost_non_negative',
      `UPDATE inventory_transactions SET unit_cost = -1 WHERE id = $1`,
      ['purchase'],
    ],
    [
      'inventory_transactions_purchase_adds',
      `UPDATE inventory_transactions SET quantity_delta = -1 WHERE id = $1`,
      ['purchase'],
    ],
    [
      'inventory_transactions_consumption_waste_remove',
      `UPDATE inventory_transactions SET quantity_delta = 1 WHERE id = $1`,
      ['wasteTxn'],
    ],
    [
      'inventory_transactions_order_only_for_consumption',
      `UPDATE inventory_transactions SET related_order_id = $2 WHERE id = $1`,
      ['purchase', 'order'],
    ],
    [
      'inventory_transactions_consumption_needs_order',
      `UPDATE inventory_transactions SET related_order_id = NULL WHERE id = $1`,
      ['consumption'],
    ],
    [
      'inventory_snapshots_through_seq_non_negative',
      `UPDATE inventory_snapshots SET through_seq = -1 WHERE id = $1`,
      ['snapshot'],
    ],
    [
      'reconciliation_entries_counted_non_negative',
      `UPDATE reconciliation_entries SET counted_quantity = -1, expected_quantity = -1 WHERE id = $1`,
      ['reconciliation'],
    ],
    [
      'reconciliation_entries_gap_is_difference',
      `UPDATE reconciliation_entries SET counted_quantity = 5, expected_quantity = 1 WHERE id = $1`,
      ['reconciliation'],
    ],
    [
      'reconciliation_entries_adjustment_iff_gap',
      `UPDATE reconciliation_entries SET counted_quantity = 2, expected_quantity = 1, gap = 1 WHERE id = $1`,
      ['reconciliation'],
    ],
    [
      'waste_entries_quantity_positive',
      `UPDATE waste_entries SET quantity = 0 WHERE id = $1`,
      ['waste'],
    ],
    [
      'order_workflow_stages_key_format',
      `UPDATE order_workflow_stages SET key = 'Delivered!' WHERE id = $1`,
      ['stageSpare'],
    ],
    [
      'order_workflow_stages_position_positive',
      `UPDATE order_workflow_stages SET position = 0 WHERE id = $1`,
      ['stageSpare'],
    ],
    ['orders_total_non_negative', `UPDATE orders SET total = -1 WHERE id = $1`, ['order']],
    [
      'orders_guest_has_no_placer',
      `UPDATE orders SET placed_by_id = $2 WHERE id = $1`,
      ['order', 'worker'],
    ],
    [
      'orders_guest_has_tracking_token',
      `UPDATE orders SET tracking_token_hash = NULL WHERE id = $1`,
      ['order'],
    ],
    [
      'order_items_quantity_positive',
      `UPDATE order_items SET quantity = 0, line_total = 0 WHERE id = $1`,
      ['orderItem'],
    ],
    [
      'order_items_unit_price_non_negative',
      `UPDATE order_items SET unit_price = -1, line_total = -2 WHERE id = $1`,
      ['orderItem'],
    ],
    [
      'order_items_line_total_is_product',
      `UPDATE order_items SET line_total = 239.99 WHERE id = $1`,
      ['orderItem'],
    ],
    [
      'order_stage_history_advance_has_stages',
      `UPDATE order_stage_history SET to_stage_key = NULL WHERE id = $1`,
      ['advanced'],
    ],
    [
      'order_stage_history_placed_has_stage',
      `UPDATE order_stage_history SET from_stage_key = 'pending' WHERE id = $1`,
      ['placed'],
    ],
    [
      'order_stage_history_canceled_has_stage',
      `UPDATE order_stage_history SET action = 'CANCELED' WHERE id = $1`,
      ['placed'],
    ],
    [
      'app_environment_single_row',
      `INSERT INTO app_environment (id, name, updated_at) VALUES (2, 'test', now())`,
      [],
    ],
  ];

  it('the valid fixture has a row in every tenant-owned table (each case below breaks one rule)', async () => {
    const { rows } = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = 'tenant_id' ORDER BY table_name`,
    );
    const empty: string[] = [];
    for (const { table_name } of rows) {
      const result = await db.query(`SELECT 1 FROM "${table_name}" WHERE tenant_id = $1 LIMIT 1`, [
        a.tenant,
      ]);
      if (result.rowCount === 0) empty.push(table_name);
    }
    // role_permissions / user_permission_overrides are unenforced in Phase 1 and carry no CHECK.
    expect(empty).toEqual(['role_permissions', 'user_permission_overrides']);
  });

  it.each(CASES)('CHECK %s rejects a bad row', async (constraint, sql, params) => {
    await expectCheck(
      constraint,
      sql,
      params.map((p) => a[p]),
    );
  });

  it('every CHECK constraint in the database has a case above', async () => {
    const { rows } = await db.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace`,
    );
    expect(rows.map((r) => r.conname).sort()).toEqual(CASES.map(([name]) => name).sort());
  });

  describe('tenant isolation through composite foreign keys', () => {
    it.each([
      [
        'a menu item in another tenant’s category',
        `UPDATE menu_items SET category_id = $2 WHERE id = $1`,
        'menuItem',
        'category',
      ],
      [
        'a ledger row on another tenant’s branch',
        `UPDATE inventory_transactions SET branch_id = $2 WHERE id = $1`,
        'purchase',
        'branch',
      ],
      [
        'a ledger row by another tenant’s user',
        `UPDATE inventory_transactions SET actor_id = $2 WHERE id = $1`,
        'purchase',
        'admin',
      ],
      [
        'an order line for another tenant’s dish',
        `UPDATE order_items SET menu_item_id = $2 WHERE id = $1`,
        'orderItem',
        'menuItem',
      ],
      [
        'stock of another tenant’s item',
        `UPDATE branch_stock SET inventory_item_id = $2 WHERE id = $1`,
        'stock',
        'raw',
      ],
    ])('refuses %s', async (_label, sql, own, foreign) => {
      const error = await attempt(sql, [a[own], b[foreign]]);
      expect(error?.code).toBe('23503'); // foreign_key_violation
    });
  });

  it('deducts an order only once per item and type (idempotency key)', async () => {
    const error = await attempt(
      `INSERT INTO inventory_transactions (id, tenant_id, branch_id, inventory_item_id, type, quantity_delta, related_order_id, actor_id, updated_at)
       VALUES ($1, $2, $3, $4, 'CONSUMPTION', -0.5, $5, $6, now())`,
      [randomUUID(), a.tenant, a.branch, a.raw, a.order, a.worker],
    );
    expect({ code: error?.code, constraint: error?.constraint }).toEqual({
      code: '23505',
      constraint: 'inventory_transactions_related_order_id_inventory_item_id_t_key',
    });
  });

  it('allows negative stock (ADR 0006)', async () => {
    expect(
      await attempt(`UPDATE branch_stock SET current_stock = -5.5 WHERE id = $1`, [a.stock]),
    ).toBeNull();
  });

  it('carries a stage key rename over to its orders (ON UPDATE CASCADE)', async () => {
    await db.query('BEGIN');
    try {
      await db.query(`UPDATE order_workflow_stages SET key = 'awaiting' WHERE id = $1`, [
        a.stagePending,
      ]);
      const { rows } = await db.query<{ stage_key: string }>(
        `SELECT stage_key FROM orders WHERE id = $1`,
        [a.order],
      );
      expect(rows[0]?.stage_key).toBe('awaiting');
    } finally {
      await db.query('ROLLBACK');
    }
  });

  it.each([
    ['a branch with orders', `DELETE FROM branches WHERE id = $1`, 'branch'],
    ['a tenant', `DELETE FROM tenants WHERE id = $1`, 'tenant'],
    ['an inventory item with ledger rows', `DELETE FROM inventory_items WHERE id = $1`, 'raw'],
  ])('refuses to hard-delete %s (Restrict)', async (_label, sql, key) => {
    expect((await attempt(sql, [a[key]]))?.code).toBe('23503');
  });

  it('stores timestamps with time zone', async () => {
    const { rows } = await db.query<{ count: string }>(
      `SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND data_type = 'timestamp without time zone'
         AND table_name <> '_prisma_migrations'`,
    );
    expect(rows[0]?.count).toBe('0');
  });
});
