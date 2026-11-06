import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { Client } from 'pg';
import { buildTenantSeed } from '../src/prisma/seed/build-seed';
import { DEMO_TENANT } from '../src/prisma/seed/demo-data';
import { TEST_DATABASE_URL, testEnv } from './test-env';

// B401 acceptance against real Postgres: the built seed CLI (dist/, built by test:e2e) runs
// twice and leaves an identical database; every demo scenario is present; and the ledger
// invariant stock = latest snapshot + ledger since holds in the stored rows.

const SEED_CLI = path.join('dist', 'prisma', 'seed', 'run-seed.js');
const DEMO = 'nile-bites';
const SECOND = 'harbor-grill';

const TENANT_TABLES = [
  'branches',
  'users',
  'order_workflow_stages',
  'categories',
  'inventory_items',
  'inventory_item_components',
  'branch_stock',
  'menu_items',
  'menu_item_ingredients',
  'orders',
  'order_items',
  'order_stage_history',
  'inventory_transactions',
  'waste_entries',
  'inventory_snapshots',
  'reconciliation_entries',
  'role_permissions',
  'user_permission_overrides',
];

function runSeed(env: Record<string, string> = {}): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, [SEED_CLI], {
    cwd: path.join(__dirname, '..'),
    env: testEnv(env),
    encoding: 'utf8',
    timeout: 120_000,
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe('seed (B401)', () => {
  const db = new Client({ connectionString: TEST_DATABASE_URL });
  let firstRun: { status: number | null; output: string };
  let afterFirst: Record<string, unknown[]>;

  /** Every row of both seed tenants, ordered by id, as plain JSON. */
  async function dump(): Promise<Record<string, unknown[]>> {
    const tenants = await db.query<{ id: string }>(
      'SELECT id FROM tenants WHERE slug = ANY($1) ORDER BY id',
      [[DEMO, SECOND]],
    );
    const ids = tenants.rows.map((r) => r.id);
    const result: Record<string, unknown[]> = {
      tenants: (await db.query('SELECT * FROM tenants WHERE id = ANY($1) ORDER BY id', [ids])).rows,
    };
    for (const table of TENANT_TABLES) {
      const { rows } = await db.query(
        `SELECT * FROM ${table} WHERE tenant_id = ANY($1) ORDER BY id`,
        [ids],
      );
      result[table] = rows;
    }
    return JSON.parse(JSON.stringify(result)) as Record<string, unknown[]>;
  }

  async function demoQuery<T extends object>(sql: string): Promise<T[]> {
    const { rows } = await db.query<T>(sql, [DEMO]);
    return rows;
  }

  beforeAll(async () => {
    await db.connect();
    firstRun = runSeed();
    afterFirst = await dump();
  });
  afterAll(() => db.end());

  it('runs on APP_ENV=test and prints the demo tracking links', () => {
    expect(firstRun).toMatchObject({ status: 0 });
    expect(firstRun.output).toContain(`Seeded ${DEMO}`);
    expect(firstRun.output).toMatch(new RegExp(`/v1/${DEMO}/track/[A-Za-z0-9_-]{43}`));
  });

  it('yields the same state when run a second time', async () => {
    expect(runSeed()).toMatchObject({ status: 0 });
    expect(await dump()).toEqual(afterFirst);
    expect(afterFirst.orders!.length).toBeGreaterThan(0);
  });

  it.each(['staging', 'production'])('refuses APP_ENV=%s', (appEnv) => {
    const result = runSeed({ APP_ENV: appEnv });
    expect(result.status).toBe(1);
    expect(result.output).toContain('The seed only runs when APP_ENV is local or test');
  });

  it('has a live order in every stage and a cancelled one', async () => {
    const rows = await demoQuery<{ key: string; live: number; cancelled: number }>(`
      SELECT s.key,
             count(o.id) FILTER (WHERE o.canceled_at IS NULL)::int AS live,
             count(o.id) FILTER (WHERE o.canceled_at IS NOT NULL)::int AS cancelled
        FROM order_workflow_stages s
        JOIN tenants t ON t.id = s.tenant_id AND t.slug = $1
        LEFT JOIN orders o ON o.tenant_id = s.tenant_id AND o.stage_key = s.key
       GROUP BY s.key, s.position ORDER BY s.position`);
    expect(rows.map((r) => r.key)).toEqual(['pending', 'in-preparation', 'ready', 'delivered']);
    expect(rows.filter((r) => r.live === 0)).toEqual([]);
    expect(rows.reduce((n, r) => n + r.cancelled, 0)).toBeGreaterThanOrEqual(1);
  });

  it('has all three inventory item types and one low-stock item', async () => {
    const types = await demoQuery<{ type: string }>(`
      SELECT DISTINCT i.type::text AS type FROM inventory_items i
        JOIN tenants t ON t.id = i.tenant_id AND t.slug = $1 ORDER BY 1`);
    expect(types.map((r) => r.type)).toEqual(['MIXED', 'RAW', 'READY']);
    const low = await demoQuery<{ name: string }>(`
      SELECT i.name FROM branch_stock s
        JOIN tenants t ON t.id = s.tenant_id AND t.slug = $1
        JOIN inventory_items i ON i.tenant_id = s.tenant_id AND i.id = s.inventory_item_id
       WHERE s.current_stock < s.low_stock_threshold`);
    expect(low.map((r) => r.name)).toEqual(['Mozzarella']);
  });

  it('keeps current_stock = latest snapshot + ledger since, for every stock row', async () => {
    const rows = await demoQuery<{ item: string; matches: boolean }>(`
      SELECT s.inventory_item_id AS item,
             s.current_stock = (coalesce(snap.quantity, 0) + coalesce((
                SELECT sum(x.quantity_delta) FROM inventory_transactions x
                 WHERE x.tenant_id = s.tenant_id AND x.branch_id = s.branch_id
                   AND x.inventory_item_id = s.inventory_item_id
                   AND x.seq > coalesce(snap.through_seq, 0)), 0)) AS matches
        FROM branch_stock s
        JOIN tenants t ON t.id = s.tenant_id AND t.slug = $1
        LEFT JOIN LATERAL (
          SELECT n.quantity, n.through_seq FROM inventory_snapshots n
           WHERE n.tenant_id = s.tenant_id AND n.branch_id = s.branch_id
             AND n.inventory_item_id = s.inventory_item_id
           ORDER BY n.through_seq DESC LIMIT 1) snap ON true`);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => !r.matches)).toEqual([]);
  });

  it('backs every stock row with ledger rows and has waste and a reconciliation', async () => {
    // Only the rows the seed itself creates: other suites may legitimately add stock rows that
    // were never restocked (a deduction before any purchase, ADR 0006).
    const seededStock = buildTenantSeed(DEMO_TENANT, new Date()).branchStock.map((s) => s.id);
    const { rows: unbacked } = await db.query(
      `SELECT s.id FROM branch_stock s
        WHERE s.id = ANY($1::uuid[])
          AND NOT EXISTS (SELECT 1 FROM inventory_transactions x
                           WHERE x.tenant_id = s.tenant_id AND x.inventory_item_id = s.inventory_item_id
                             AND x.type = 'PURCHASE')`,
      [seededStock],
    );
    expect(seededStock.length).toBeGreaterThan(0);
    expect(unbacked).toEqual([]);
    const waste = await demoQuery<{ type: string }>(`
      SELECT x.type FROM waste_entries w
        JOIN tenants t ON t.id = w.tenant_id AND t.slug = $1
        JOIN inventory_transactions x ON x.tenant_id = w.tenant_id AND x.id = w.transaction_id`);
    expect(waste.map((r) => r.type)).toEqual(['WASTE']);
    const reconciled = await demoQuery<{ gap: string; adjusted: boolean }>(`
      SELECT r.gap::text AS gap, r.adjustment_transaction_id IS NOT NULL AS adjusted
        FROM reconciliation_entries r
        JOIN tenants t ON t.id = r.tenant_id AND t.slug = $1
        JOIN inventory_snapshots n ON n.tenant_id = r.tenant_id AND n.id = r.snapshot_id
       ORDER BY r.gap`);
    expect(reconciled).toEqual([
      { gap: '-0.250', adjusted: true },
      { gap: '0.000', adjusted: false },
    ]);
  });

  it('seeds a second tenant with the stages and one demo user per role', async () => {
    const { rows } = await db.query<{ stages: number; roles: string[]; is_demo: boolean }>(
      `SELECT t.is_demo,
              (SELECT count(*)::int FROM order_workflow_stages s WHERE s.tenant_id = t.id) AS stages,
              (SELECT array_agg(u.role::text ORDER BY u.role) FROM users u
                WHERE u.tenant_id = t.id AND u.is_demo) AS roles
         FROM tenants t WHERE t.slug = $1`,
      [SECOND],
    );
    expect(rows).toEqual([{ is_demo: false, stages: 4, roles: ['ADMIN', 'MANAGER', 'WORKER'] }]);
  });
});
