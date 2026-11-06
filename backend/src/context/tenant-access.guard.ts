import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../common/errors/app-exception';
import type { UserRole } from '../generated/prisma/enums';
import { ALLOW_GUEST_KEY, ROLES_KEY } from './access.decorators';
import type { RequestContext } from './request-context';
import {
  REQUEST_CONTEXT_PROVIDER,
  type ContextInput,
  type RequestContextProvider,
} from './request-context.provider';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

interface TenantRequest {
  method: string;
  params?: Record<string, string | undefined>;
  headers: ContextInput['headers'];
  tablzContext?: RequestContext;
}

/**
 * Global guard for `/v1/:tenantSlug/...` routes (ARCHITECTURE §3):
 * 1. resolves the context through the swappable provider and attaches it to the request;
 * 2. role check: staff-only unless @AllowGuest; @Roles narrows; ADMIN always passes;
 * 3. demo safety: only the demo tenant accepts writes until JWT ships (ADR 0007).
 */
@Injectable()
export class TenantAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(REQUEST_CONTEXT_PROVIDER) private readonly provider: RequestContextProvider,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    const tenantSlug = request.params?.tenantSlug;
    if (tenantSlug === undefined) return true;

    const ctx = await this.provider.resolve({ tenantSlug, headers: request.headers });
    request.tablzContext = ctx;

    const targets = [context.getHandler(), context.getClass()];
    const allowGuest = this.reflector.getAllAndOverride<boolean>(ALLOW_GUEST_KEY, targets) ?? false;
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, targets);
    const role = ctx.actor?.role;

    if (role === undefined) {
      if (!allowGuest) {
        throw new AppException(401, 'AUTH_REQUIRED', 'This action needs a staff role.');
      }
    } else if (roles && role !== 'ADMIN' && !roles.includes(role)) {
      throw new AppException(403, 'ROLE_FORBIDDEN', `A ${role} cannot do this.`, { roles });
    }

    if (!SAFE_METHODS.has(request.method.toUpperCase()) && !ctx.isDemoTenant) {
      throw new AppException(
        403,
        'DEMO_READ_ONLY',
        'Only the demo restaurant accepts changes until login ships.',
      );
    }
    return true;
  }
}
