import type { PrismaClient } from '../generated/prisma/client';
import { scopeQueryArgs } from './tenant-scope';

/**
 * The tenant-scoped client: the only database access feature code may use (ARCHITECTURE §3).
 * Every model query goes through scopeQueryArgs with the current request's tenant. Raw queries
 * (`$queryRaw`, `$executeRaw`) are NOT scoped; feature code must not use them (ADR 0015).
 *
 * Prisma's types still require `tenantId` on creates: pass the context's tenant
 * (`store.require().tenantId`). The extension is the safety net: it refuses any other tenant and
 * fills the id in when an untyped caller leaves it out.
 *
 * Prisma queries are lazy: the tenant is read when the query is awaited, not when it is built.
 * A query awaited outside its request (e.g. handed to a timer or a queue) fails with "no request
 * context" instead of running unscoped. Await queries inside the request that issued them.
 */
// The extended client type is what Prisma infers; spelling it out would duplicate the generated types.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createTenantClient(prisma: PrismaClient, currentTenantId: () => string) {
  return prisma.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          const scoped = scopeQueryArgs(model, operation, args, currentTenantId());
          return query(scoped);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof createTenantClient>;

/** Inject with `@Inject(TENANT_DB) private readonly db: TenantDb`. */
export const TENANT_DB = Symbol('TENANT_DB');
