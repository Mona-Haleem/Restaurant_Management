import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../common/errors/app-exception';
import { AllowGuest, Roles } from './access.decorators';
import type { RequestContext } from './request-context';
import type { RequestContextProvider } from './request-context.provider';
import { TenantAccessGuard } from './tenant-access.guard';

// ARCHITECTURE §3: provider → role guard. The guard reads only the context object the provider
// returns, never a header; staff-only unless @AllowGuest; writes only on the demo tenant.

class Routes {
  staffOnly(): void {}
  @AllowGuest()
  guests(): void {}
  @Roles('MANAGER')
  managers(): void {}
  @AllowGuest()
  @Roles('WORKER')
  guestsOrWorkers(): void {}
}

const base: RequestContext = {
  tenantId: 't',
  tenantSlug: 'nile-bites',
  tenantName: 'Nile Bites',
  isDemoTenant: true,
  branchId: 'b',
  actor: null,
};
const as = (role: 'ADMIN' | 'MANAGER' | 'WORKER' | null, over: Partial<RequestContext> = {}) => ({
  ...base,
  actor: role ? { id: 'u', name: 'n', role } : null,
  ...over,
});

function run(
  handler: keyof Routes,
  ctx: RequestContext,
  request: {
    method?: string;
    params?: Record<string, string>;
    headers?: Record<string, string>;
  } = {},
) {
  const provider: RequestContextProvider = { resolve: jest.fn(() => Promise.resolve(ctx)) };
  const req = {
    method: 'GET',
    params: { tenantSlug: 'nile-bites' },
    headers: {},
    ...request,
  } as Record<string, unknown>;
  const context = {
    getHandler: () => Routes.prototype[handler],
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  const guard = new TenantAccessGuard(new Reflector(), provider);
  return { result: guard.canActivate(context), provider, req };
}

async function code(promise: Promise<boolean>): Promise<string> {
  try {
    await promise;
    return 'ALLOWED';
  } catch (error) {
    if (error instanceof AppException) return `${error.getStatus()} ${error.code}`;
    throw error;
  }
}

describe('TenantAccessGuard', () => {
  it('ignores routes outside /v1/:tenantSlug', async () => {
    const { result, provider } = run('staffOnly', as(null), { params: {} });
    expect(await result).toBe(true);
    expect(provider.resolve).not.toHaveBeenCalled();
  });

  it('resolves the context through the provider and attaches it to the request', async () => {
    const ctx = as('WORKER');
    const { result, provider, req } = run('staffOnly', ctx, {
      headers: { 'x-dev-role': 'WORKER' },
    });
    expect(await result).toBe(true);
    expect(provider.resolve).toHaveBeenCalledWith({
      tenantSlug: 'nile-bites',
      headers: { 'x-dev-role': 'WORKER' },
    });
    expect(req.tablzContext).toBe(ctx);
  });

  it.each([
    ['staffOnly', null, '401 AUTH_REQUIRED'],
    ['staffOnly', 'WORKER', 'ALLOWED'],
    ['guests', null, 'ALLOWED'],
    ['guests', 'MANAGER', 'ALLOWED'],
    ['managers', null, '401 AUTH_REQUIRED'],
    ['managers', 'WORKER', '403 ROLE_FORBIDDEN'],
    ['managers', 'MANAGER', 'ALLOWED'],
    ['managers', 'ADMIN', 'ALLOWED'],
    ['guestsOrWorkers', null, 'ALLOWED'],
    ['guestsOrWorkers', 'WORKER', 'ALLOWED'],
    ['guestsOrWorkers', 'MANAGER', '403 ROLE_FORBIDDEN'],
  ] as const)('%s as %s → %s', async (handler, role, expected) => {
    expect(await code(run(handler, as(role)).result)).toBe(expected);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('refuses %s on a non-demo tenant', async (method) => {
    expect(
      await code(run('staffOnly', as('ADMIN', { isDemoTenant: false }), { method }).result),
    ).toBe('403 DEMO_READ_ONLY');
    expect(await code(run('staffOnly', as('ADMIN'), { method }).result)).toBe('ALLOWED');
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('allows %s on a non-demo tenant', async (method) => {
    expect(
      await code(run('staffOnly', as('ADMIN', { isDemoTenant: false }), { method }).result),
    ).toBe('ALLOWED');
  });
});
