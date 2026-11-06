import { AppException } from '../common/errors/app-exception';
import type { UserRole } from '../generated/prisma/enums';
import type { ContextLookup, LookupUser } from './context-lookup';
import { DEV_HEADERS } from './dev-headers';
import type { RequestContext } from './request-context';
import type { ContextInput, RequestContextProvider } from './request-context.provider';

const ROLES: readonly UserRole[] = ['ADMIN', 'MANAGER', 'WORKER'];
/** Same rule as the tenants_slug_format CHECK; checked before any lookup. */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalid(header: string, message: string): never {
  throw new AppException(401, 'DEV_IDENTITY_INVALID', message, { header });
}

/** One header value; a repeated header is refused rather than guessed at. */
function single(headers: ContextInput['headers'], name: string): string | undefined {
  const value = headers[name];
  if (Array.isArray(value)) invalid(name, `Send ${name} once.`);
  return value;
}

/**
 * ADR 0007: tenant from the path slug; `x-dev-role` selects the tenant's demo user with that role
 * (or `x-dev-user` a specific active user); branch from the user, `x-dev-branch` for ADMIN, or the
 * tenant's only branch. No headers = guest.
 */
export class DevHeaderContextProvider implements RequestContextProvider {
  constructor(private readonly lookup: ContextLookup) {}

  async resolve({ tenantSlug, headers }: ContextInput): Promise<RequestContext> {
    const tenant =
      tenantSlug.length <= 64 && SLUG.test(tenantSlug)
        ? await this.lookup.findTenantBySlug(tenantSlug)
        : null;
    if (!tenant || !tenant.isActive) {
      // The raw slug is never echoed back: it is caller input.
      throw new AppException(404, 'TENANT_NOT_FOUND', 'No such restaurant.');
    }

    const roleHeader = single(headers, DEV_HEADERS.role);
    const userHeader = single(headers, DEV_HEADERS.user);
    const branchHeader = single(headers, DEV_HEADERS.branch);
    if (roleHeader !== undefined && !(ROLES as readonly string[]).includes(roleHeader)) {
      invalid(DEV_HEADERS.role, `${DEV_HEADERS.role} must be one of ${ROLES.join(', ')}.`);
    }
    const role = roleHeader as UserRole | undefined;

    let user: LookupUser | null = null;
    if (userHeader !== undefined) {
      if (!UUID.test(userHeader))
        invalid(DEV_HEADERS.user, `${DEV_HEADERS.user} must be a user id.`);
      user = await this.lookup.findActiveUser(tenant.id, userHeader);
      if (!user) invalid(DEV_HEADERS.user, 'No active user with that id in this restaurant.');
      if (role !== undefined && role !== user.role) {
        invalid(DEV_HEADERS.role, `${DEV_HEADERS.role} does not match the user's role.`);
      }
    } else if (role !== undefined) {
      user = await this.lookup.findDemoUser(tenant.id, role);
      if (!user) invalid(DEV_HEADERS.role, `This restaurant has no demo ${role}.`);
    }

    const branchIds = await this.lookup.findActiveBranchIds(tenant.id);
    let branchId: string | null;
    if (branchHeader !== undefined) {
      if (user?.role !== 'ADMIN') {
        invalid(
          DEV_HEADERS.branch,
          `Only an ADMIN may choose a branch with ${DEV_HEADERS.branch}.`,
        );
      }
      if (!UUID.test(branchHeader) || !branchIds.includes(branchHeader)) {
        invalid(DEV_HEADERS.branch, 'No active branch with that id in this restaurant.');
      }
      branchId = branchHeader;
    } else if (user && user.role !== 'ADMIN') {
      branchId = user.branchId;
    } else {
      branchId = branchIds.length === 1 ? (branchIds[0] ?? null) : null;
    }

    return {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      isDemoTenant: tenant.isDemo,
      branchId,
      actor: user ? { id: user.id, name: user.name, role: user.role } : null,
    };
  }
}
