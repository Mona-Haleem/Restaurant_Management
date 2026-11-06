/**
 * Rewrites a Prisma query so it can only touch one tenant (CLAUDE.md rule 1, ADR 0015).
 * Pure: the client extension in tenant-prisma.ts calls it for every model operation.
 *
 * - Filters: `tenant_id = <tenant>` is AND-ed onto the query's own `where`, so the caller's
 *   conditions still apply but can never widen the result to another tenant.
 * - Creates: `tenant_id` is set; a row that names another tenant is refused.
 * - Updates: a change of `tenant_id` to another tenant is refused.
 * - Nested relation writes (`connect`, nested `create`, `set`, …) are refused: a nested connect
 *   writes the parent's key, `tenant_id` included, onto the child and could pull another
 *   tenant's row in. Write related rows with their own scoped query instead.
 * - No hard deletes (CLAUDE.md rule 5): `delete` / `deleteMany` are refused.
 * - `tenants` is scoped by its own id and is read-only; `app_environment` is off limits.
 * - Unknown operations are refused, so a new Prisma operation can never slip through unscoped.
 */

export class TenantScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantScopeError';
  }
}

type Args = Record<string, unknown>;
type Row = Record<string, unknown>;

const FILTER_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);
const UPDATE_OPERATIONS = new Set(['update', 'updateMany', 'updateManyAndReturn']);
const CREATE_MANY_OPERATIONS = new Set(['createMany', 'createManyAndReturn']);
const DELETE_OPERATIONS = new Set(['delete', 'deleteMany']);
const TENANT_TABLE_WRITES = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'upsert',
  'update',
  'updateMany',
  'updateManyAndReturn',
]);

/** Keys that only appear in a relation write (scalar update operators use set/increment/…). */
const RELATION_WRITE_KEYS = new Set([
  'connect',
  'connectOrCreate',
  'disconnect',
  'create',
  'createMany',
  'upsert',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

function isObject(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A literal object (not a Date, Decimal or other class instance). */
function isPlainObject(value: unknown): value is Row {
  if (!isObject(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/** Refuses any nested relation write in a create/update payload (see the header comment). */
function refuseNestedWrites(data: unknown, model: string, skip: string[] = []): void {
  if (!isObject(data)) return;
  for (const [field, value] of Object.entries(data)) {
    if (skip.includes(field) || !isPlainObject(value)) continue;
    const keys = Object.keys(value);
    // `set` is also a scalar operator; as a relation write it takes an array or a where-unique.
    const relationSet = 'set' in value && (Array.isArray(value.set) || isPlainObject(value.set));
    if (relationSet || keys.some((key) => RELATION_WRITE_KEYS.has(key))) {
      refuse(
        `${model}.${field}: nested relation writes are not allowed in the tenant-scoped client; ` +
          'write the related rows with their own query',
      );
    }
  }
}

function withScope(where: unknown, scope: Row): Row {
  const base = isObject(where) ? where : {};
  const and = base.AND === undefined ? [] : Array.isArray(base.AND) ? base.AND : [base.AND];
  return { ...base, AND: [...(and as unknown[]), scope] };
}

function refuse(message: string): never {
  throw new TenantScopeError(message);
}

function scopeRow(row: unknown, tenantId: string, model: string): Row {
  const data = isObject(row) ? row : {};
  refuseNestedWrites(data, model, ['tenant']);
  if (data.tenant !== undefined) {
    // Checked input (relation fields): connect the tenant relation instead of the scalar.
    const connect =
      isObject(data.tenant) && isObject(data.tenant.connect) ? data.tenant.connect : {};
    if (connect.id !== undefined && connect.id !== tenantId) {
      refuse(`${model}: refusing to create a row for another tenant`);
    }
    return { ...data, tenant: { connect: { id: tenantId } } };
  }
  if (data.tenantId !== undefined && data.tenantId !== tenantId) {
    refuse(`${model}: refusing to create a row for another tenant`);
  }
  return { ...data, tenantId };
}

function checkUpdate(data: unknown, tenantId: string, model: string): void {
  if (!isObject(data)) return;
  refuseNestedWrites(data, model, ['tenant']);
  if (data.tenant !== undefined || (data.tenantId !== undefined && data.tenantId !== tenantId)) {
    refuse(`${model}: refusing to move a row to another tenant`);
  }
}

export function scopeQueryArgs(
  model: string,
  operation: string,
  args: Args | undefined,
  tenantId: string,
): Args {
  if (model === 'AppEnvironment') refuse('app_environment is not tenant data');
  const isTenantTable = model === 'Tenant';
  if (isTenantTable && TENANT_TABLE_WRITES.has(operation)) {
    refuse(`tenants: ${operation} is not allowed from a tenant request`);
  }
  if (DELETE_OPERATIONS.has(operation)) {
    refuse(
      `${model}.${operation}: no hard deletes (CLAUDE.md rule 5); archive or deactivate instead`,
    );
  }
  const scope: Row = isTenantTable ? { id: tenantId } : { tenantId };
  const scoped: Args = { ...(args ?? {}) };

  if (FILTER_OPERATIONS.has(operation)) {
    scoped.where = withScope(scoped.where, scope);
  } else if (UPDATE_OPERATIONS.has(operation)) {
    scoped.where = withScope(scoped.where, scope);
    checkUpdate(scoped.data, tenantId, model);
  } else if (operation === 'create') {
    scoped.data = scopeRow(scoped.data, tenantId, model);
  } else if (CREATE_MANY_OPERATIONS.has(operation)) {
    const rows = Array.isArray(scoped.data) ? scoped.data : [scoped.data];
    scoped.data = rows.map((row: unknown) => scopeRow(row, tenantId, model));
  } else if (operation === 'upsert') {
    scoped.where = withScope(scoped.where, scope);
    scoped.create = scopeRow(scoped.create, tenantId, model);
    checkUpdate(scoped.update, tenantId, model);
  } else {
    refuse(`${model}.${operation}: unknown operation, refusing to run it unscoped`);
  }
  return scoped;
}
