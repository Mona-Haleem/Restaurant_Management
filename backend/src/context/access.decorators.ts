import {
  applyDecorators,
  createParamDecorator,
  SetMetadata,
  type ExecutionContext,
} from '@nestjs/common';
import { ApiHeader, ApiParam } from '@nestjs/swagger';
import type { UserRole } from '../generated/prisma/enums';
import { DEV_HEADERS } from './dev-headers';
import type { RequestContext } from './request-context';

export const ALLOW_GUEST_KEY = 'tablz:allowGuest';
export const ROLES_KEY = 'tablz:roles';

/**
 * Lets callers without a role (guests) in. Tenant routes are staff-only without it. Combined
 * with @Roles, guests are let in and staff must have one of the roles.
 */
export const AllowGuest = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_GUEST_KEY, true);

/** Narrows a route to these roles; ADMIN always passes (ARCHITECTURE §3). */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

/** The request context the guard resolved. Only valid on `/v1/:tenantSlug/...` routes. */
export const CurrentContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestContext =>
    context.switchToHttp().getRequest<{ tablzContext: RequestContext }>().tablzContext,
);

/** Documents the tenant path parameter and the Phase 1 identity headers (ADR 0007). */
export function TenantRoute(): ClassDecorator & MethodDecorator {
  return applyDecorators(
    ApiParam({
      name: 'tenantSlug',
      description: 'The restaurant, e.g. `nile-bites` (the demo tenant).',
      example: 'nile-bites',
    }),
    ApiHeader({
      name: DEV_HEADERS.role,
      required: false,
      enum: ['ADMIN', 'MANAGER', 'WORKER'],
      description:
        "Phase 1 only: act as the restaurant's demo user with this role. Omit for a guest.",
    }),
    ApiHeader({
      name: DEV_HEADERS.user,
      required: false,
      description: 'Phase 1 only: act as this active user (uuid) of the restaurant.',
    }),
    ApiHeader({
      name: DEV_HEADERS.branch,
      required: false,
      description: 'Phase 1 only, ADMIN: the branch (uuid) to act in.',
    }),
  );
}
