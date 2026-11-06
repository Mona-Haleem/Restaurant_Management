import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseSchema } from './schema-parser';

// The hand-written CHECK constraints in the committed migrations, checked against the current
// schema without a database. test/schema-constraints.e2e-spec.ts proves they reject bad rows.

const backendDir = path.join(__dirname, '..', '..');
const migrationsDir = path.join(backendDir, 'prisma', 'migrations');
const schema = parseSchema(readFileSync(path.join(backendDir, 'prisma', 'schema.prisma'), 'utf8'));
const sql = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => readFileSync(path.join(migrationsDir, entry.name, 'migration.sql'), 'utf8'))
  .join('\n');

const CHECK = /^ALTER TABLE "(\w+)" ADD CONSTRAINT "(\w+)" CHECK \((.*)\);$/gm;
const checks = [...sql.matchAll(CHECK)].map(([, table = '', name = '', body = '']) => ({
  table,
  name,
  body,
}));

function columnsOf(table: string): Set<string> {
  const model = schema.models.find((m) => m.dbName === table);
  return new Set(model?.fields.map((f) => f.dbName ?? f.name) ?? []);
}

describe('CHECK constraints in the migrations', () => {
  it('every statement is a well-formed ADD CONSTRAINT … CHECK', () => {
    const statements = sql
      .split('\n')
      .filter((l) => l.startsWith('ALTER TABLE') && l.includes(' CHECK '));
    expect(checks).toHaveLength(statements.length);
  });

  it('constraint names are unique and prefixed with their table', () => {
    const names = checks.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const { table, name } of checks) expect(name.startsWith(`${table}_`)).toBe(true);
  });

  it('only references tables and columns that exist', () => {
    for (const { table, name, body } of checks) {
      const columns = columnsOf(table);
      expect({ name, tableExists: columns.size > 0 }).toEqual({ name, tableExists: true });
      for (const [, column = ''] of body.matchAll(/"(\w+)"/g)) {
        expect(`${name}: ${column} ${columns.has(column) ? 'exists' : 'missing'}`).toMatch(
          /exists$/,
        );
      }
    }
  });

  it('every UPPER_CASE literal is a value of one of its table enums (a typo fails here, not at migrate time)', () => {
    for (const { table, name, body } of checks) {
      const model = schema.models.find((m) => m.dbName === table);
      const allowed = new Set(
        (model?.fields ?? []).flatMap(
          (f) => schema.enums.find((e) => e.name === f.type)?.values ?? [],
        ),
      );
      for (const [, literal = ''] of body.matchAll(/'([A-Z_]+)'/g)) {
        expect(
          `${name}: '${literal}' ${allowed.has(literal) ? 'is an enum value' : 'is unknown'}`,
        ).toMatch(/is an enum value$/);
      }
    }
  });

  it.each([
    ['menu_item_ingredients', 'quantity'],
    ['inventory_item_components', 'quantity'],
    ['waste_entries', 'quantity'],
    ['order_items', 'quantity'],
  ])('%s.%s must be positive', (table, column) => {
    expect(checks).toContainEqual({
      table,
      name: expect.any(String) as unknown,
      body: `"${column}" > 0`,
    });
  });

  it.each([
    ['menu_items', 'price'],
    ['orders', 'total'],
    ['order_items', 'unit_price'],
  ])('%s.%s must not be negative', (table, column) => {
    expect(checks).toContainEqual({
      table,
      name: expect.any(String) as unknown,
      body: `"${column}" >= 0`,
    });
  });

  it('never constrains branch_stock.current_stock (negative stock is allowed, ADR 0006)', () => {
    expect(checks.filter((c) => c.body.includes('"current_stock"'))).toEqual([]);
  });

  it('enforces the ADR rules a CHECK can express', () => {
    const names = checks.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'users_branch_required_unless_admin', // ADR 0007
        'order_workflow_stages_key_format', // ADR 0009
        'inventory_items_standard_unit_cost_non_negative', // ADR 0005
        'inventory_transactions_unit_cost_non_negative', // ADR 0005
        'inventory_item_components_not_self', // ADR 0002
      ]),
    );
  });
});
