import { AppException } from '../common/errors/app-exception';
import type { ContextLookup, LookupTenant, LookupUser } from './context-lookup';
import { DevHeaderContextProvider } from './dev-header-context.provider';

// ADR 0007: tenant from the path slug; x-dev-role → the tenant's demo user; optional x-dev-user;
// branch from the user, x-dev-branch for ADMIN, or the only branch. Phase 2 replaces this class.

const TENANT: LookupTenant = {
  id: 'tenant-a',
  slug: 'nile-bites',
  name: 'Nile Bites',
  isDemo: true,
  isActive: true,
};
const BRANCH = '11111111-1111-4111-8111-111111111111';
const OTHER_BRANCH = '22222222-2222-4222-8222-222222222222';
const USERS: (LookupUser & { tenantId: string; isDemo: boolean; isActive: boolean })[] = [
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    name: 'Karim',
    role: 'ADMIN',
    branchId: null,
    tenantId: 'tenant-a',
    isDemo: true,
    isActive: true,
  },
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000002',
    name: 'Salma',
    role: 'MANAGER',
    branchId: BRANCH,
    tenantId: 'tenant-a',
    isDemo: true,
    isActive: true,
  },
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000003',
    name: 'Omar',
    role: 'WORKER',
    branchId: BRANCH,
    tenantId: 'tenant-a',
    isDemo: true,
    isActive: true,
  },
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000004',
    name: 'Gone',
    role: 'WORKER',
    branchId: BRANCH,
    tenantId: 'tenant-a',
    isDemo: false,
    isActive: false,
  },
  {
    id: 'bbbbbbbb-0000-4000-8000-000000000001',
    name: 'Nadia',
    role: 'ADMIN',
    branchId: null,
    tenantId: 'tenant-b',
    isDemo: true,
    isActive: true,
  },
];

function lookup(
  branches: string[] = [BRANCH],
  tenant: LookupTenant | null = TENANT,
): ContextLookup {
  const pick = ({ id, name, role, branchId }: LookupUser): LookupUser => ({
    id,
    name,
    role,
    branchId,
  });
  return {
    findTenantBySlug: (slug) => Promise.resolve(tenant && tenant.slug === slug ? tenant : null),
    findDemoUser: (tenantId, role) => {
      const user = USERS.find(
        (u) => u.tenantId === tenantId && u.role === role && u.isDemo && u.isActive,
      );
      return Promise.resolve(user ? pick(user) : null);
    },
    findActiveUser: (tenantId, userId) => {
      const user = USERS.find((u) => u.tenantId === tenantId && u.id === userId && u.isActive);
      return Promise.resolve(user ? pick(user) : null);
    },
    findActiveBranchIds: (tenantId) => Promise.resolve(tenantId === 'tenant-a' ? branches : []),
  };
}

async function failure(
  promise: Promise<unknown>,
): Promise<{ status: number; code: string; details: unknown }> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppException) {
      return { status: error.getStatus(), code: error.code, details: error.details };
    }
    throw error;
  }
  throw new Error('expected the provider to refuse');
}

describe('DevHeaderContextProvider', () => {
  const provider = new DevHeaderContextProvider(lookup());
  const resolve = (
    headers: Record<string, string | string[] | undefined> = {},
    slug = 'nile-bites',
  ) => provider.resolve({ tenantSlug: slug, headers });

  describe('tenant', () => {
    it('comes from the path slug', async () => {
      expect(await resolve()).toMatchObject({
        tenantId: 'tenant-a',
        tenantSlug: 'nile-bites',
        tenantName: 'Nile Bites',
        isDemoTenant: true,
      });
    });

    it('answers 404 TENANT_NOT_FOUND for an unknown or inactive slug', async () => {
      for (const slug of ['nope', 'Not A Slug', '../etc', 'x'.repeat(65)]) {
        expect(await failure(resolve({}, slug))).toEqual({
          status: 404,
          code: 'TENANT_NOT_FOUND',
          details: {},
        });
      }
      const inactive = new DevHeaderContextProvider(
        lookup([BRANCH], { ...TENANT, isActive: false }),
      );
      expect(
        await failure(inactive.resolve({ tenantSlug: 'nile-bites', headers: {} })),
      ).toMatchObject({
        status: 404,
        code: 'TENANT_NOT_FOUND',
      });
    });
  });

  describe('actor', () => {
    it('is a guest with no headers, on the only branch', async () => {
      expect(await resolve()).toMatchObject({ actor: null, branchId: BRANCH });
    });

    it.each([
      ['ADMIN', 'Karim'],
      ['MANAGER', 'Salma'],
      ['WORKER', 'Omar'],
    ])('x-dev-role %s selects the demo %s', async (role, name) => {
      expect((await resolve({ 'x-dev-role': role })).actor).toMatchObject({ role, name });
    });

    it('x-dev-user selects a specific active user of the tenant', async () => {
      const ctx = await resolve({ 'x-dev-user': USERS[1]!.id });
      expect(ctx.actor).toEqual({ id: USERS[1]!.id, name: 'Salma', role: 'MANAGER' });
    });

    it.each([
      ['an unknown role', { 'x-dev-role': 'CHEF' }, 'x-dev-role'],
      ['a lowercase role', { 'x-dev-role': 'admin' }, 'x-dev-role'],
      ['a repeated header', { 'x-dev-role': ['ADMIN', 'WORKER'] }, 'x-dev-role'],
      ['a user id that is not a uuid', { 'x-dev-user': 'karim' }, 'x-dev-user'],
      ['an inactive user', { 'x-dev-user': USERS[3]!.id }, 'x-dev-user'],
      ["another tenant's user", { 'x-dev-user': USERS[4]!.id }, 'x-dev-user'],
      [
        'a role that does not match the user',
        { 'x-dev-user': USERS[1]!.id, 'x-dev-role': 'ADMIN' },
        'x-dev-role',
      ],
    ])('answers 401 DEV_IDENTITY_INVALID for %s', async (_case, headers, header) => {
      expect(await failure(resolve(headers))).toEqual({
        status: 401,
        code: 'DEV_IDENTITY_INVALID',
        details: { header },
      });
    });

    it('answers 401 when the tenant has no demo user for the role', async () => {
      const none = new DevHeaderContextProvider({
        ...lookup(),
        findDemoUser: () => Promise.resolve(null),
      });
      expect(
        await failure(
          none.resolve({ tenantSlug: 'nile-bites', headers: { 'x-dev-role': 'WORKER' } }),
        ),
      ).toMatchObject({ status: 401, code: 'DEV_IDENTITY_INVALID' });
    });
  });

  describe('branch', () => {
    it("uses a MANAGER's or WORKER's own branch", async () => {
      const many = new DevHeaderContextProvider(lookup([BRANCH, OTHER_BRANCH]));
      const ctx = await many.resolve({
        tenantSlug: 'nile-bites',
        headers: { 'x-dev-role': 'WORKER' },
      });
      expect(ctx.branchId).toBe(BRANCH);
    });

    it('uses x-dev-branch for ADMIN when it is an active branch of the tenant', async () => {
      const many = new DevHeaderContextProvider(lookup([BRANCH, OTHER_BRANCH]));
      const ctx = await many.resolve({
        tenantSlug: 'nile-bites',
        headers: { 'x-dev-role': 'ADMIN', 'x-dev-branch': OTHER_BRANCH },
      });
      expect(ctx.branchId).toBe(OTHER_BRANCH);
    });

    it('falls back to the only branch for ADMIN, and to none when there are several', async () => {
      expect((await resolve({ 'x-dev-role': 'ADMIN' })).branchId).toBe(BRANCH);
      const many = new DevHeaderContextProvider(lookup([BRANCH, OTHER_BRANCH]));
      const ctx = await many.resolve({
        tenantSlug: 'nile-bites',
        headers: { 'x-dev-role': 'ADMIN' },
      });
      expect(ctx.branchId).toBeNull();
    });

    it.each([
      ['ADMIN with an unknown branch', { 'x-dev-role': 'ADMIN', 'x-dev-branch': OTHER_BRANCH }],
      ['ADMIN with a non-uuid branch', { 'x-dev-role': 'ADMIN', 'x-dev-branch': 'zamalek' }],
      ['a WORKER sending x-dev-branch', { 'x-dev-role': 'WORKER', 'x-dev-branch': BRANCH }],
      ['a guest sending x-dev-branch', { 'x-dev-branch': BRANCH }],
    ])('answers 401 DEV_IDENTITY_INVALID for %s', async (_case, headers) => {
      expect(await failure(resolve(headers))).toEqual({
        status: 401,
        code: 'DEV_IDENTITY_INVALID',
        details: { header: 'x-dev-branch' },
      });
    });
  });
});
