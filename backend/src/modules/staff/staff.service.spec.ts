import { AppException } from '../../common/errors/app-exception';
import { RequestContextStore } from '../../context/request-context.store';
import type { RequestContext } from '../../context/request-context';
import type { TenantDb } from '../../prisma/tenant-prisma';
import { StaffService } from './staff.service';

// Unit tests for the service's own decisions (visibility filter, error mapping, what it writes).
// The rules are in staff-rules.spec.ts; real queries, tenant scoping and Postgres behaviour are
// proven in test/staff.e2e-spec.ts and test/tenant-isolation.e2e-spec.ts.

const ADMIN_CTX: RequestContext = {
  tenantId: 'tenant-a',
  tenantSlug: 'nile-bites',
  tenantName: 'Nile Bites',
  isDemoTenant: true,
  branchId: 'branch-1',
  actor: { id: 'admin', name: 'Karim', role: 'ADMIN' },
};
const MANAGER_CTX: RequestContext = {
  ...ADMIN_CTX,
  actor: { id: 'manager', name: 'Salma', role: 'MANAGER' },
};

const ROW = {
  id: 'w1',
  name: 'Omar',
  email: 'omar@x.example',
  role: 'WORKER',
  branchId: 'branch-1',
  isActive: true,
  updatedAt: new Date('2026-11-06T10:00:00Z'),
};

function fakeDb() {
  return {
    user: {
      findMany: jest.fn().mockResolvedValue([ROW]),
      findFirst: jest.fn().mockResolvedValue({ ...ROW, isDemo: false }),
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...ROW, ...args.data }),
      ),
      update: jest.fn().mockResolvedValue(ROW),
    },
    branch: { findFirst: jest.fn().mockResolvedValue({ id: 'branch-1' }) },
  };
}

function firstArg(fn: jest.Mock): unknown {
  return (fn.mock.calls[0] as unknown[])[0];
}

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppException) return `${error.getStatus()} ${error.code}`;
    throw error;
  }
  return 'OK';
}

describe('StaffService', () => {
  let db: ReturnType<typeof fakeDb>;
  let service: StaffService;
  const store = new RequestContextStore();
  const inContext = <T>(fn: () => Promise<T>, ctx: RequestContext = ADMIN_CTX): Promise<T> =>
    store.run(ctx, async () => await fn());

  beforeEach(() => {
    db = fakeDb();
    service = new StaffService(db as unknown as TenantDb, store);
  });

  it('lists with filters; a MANAGER is limited to their branch', async () => {
    await expect(inContext(() => service.listStaff({ status: 'INACTIVE' }))).resolves.toEqual([
      { ...ROW, updatedAt: '2026-11-06T10:00:00.000Z' },
    ]);
    expect(firstArg(db.user.findMany)).toMatchObject({
      where: { AND: [{}, { isActive: false }, {}, {}] },
    });
    db.user.findMany.mockClear();
    await inContext(() => service.listStaff({ role: 'WORKER', branchId: 'b2' }), MANAGER_CTX);
    expect(firstArg(db.user.findMany)).toMatchObject({
      where: { AND: [{ branchId: 'branch-1' }, {}, { role: 'WORKER' }, { branchId: 'b2' }] },
    });
  });

  it('gets one, or 404s', async () => {
    await expect(inContext(() => service.getStaffMember('w1'))).resolves.toMatchObject({
      id: 'w1',
    });
    db.user.findFirst.mockResolvedValueOnce(null);
    expect(await failure(inContext(() => service.getStaffMember('nope')))).toBe(
      '404 STAFF_NOT_FOUND',
    );
  });

  it('creates with an argon2id hash and the tenant id, never returning the hash', async () => {
    const created = await inContext(() =>
      service.createStaffMember({
        name: 'New',
        email: 'new@x.example',
        password: 'a-long-password',
        role: 'WORKER',
      }),
    );
    const data = (firstArg(db.user.create) as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ tenantId: 'tenant-a', role: 'WORKER', branchId: 'branch-1' });
    expect(data.passwordHash).toMatch(/^\$argon2id\$/);
    expect(created).not.toHaveProperty('passwordHash');
  });

  it('maps a duplicate email to 409 and an unknown branch to 400', async () => {
    db.user.create.mockRejectedValueOnce({ code: 'P2002' });
    const dto = { name: 'N', password: 'a-long-password', role: 'WORKER' as const };
    expect(await failure(inContext(() => service.createStaffMember(dto)))).toBe(
      '409 STAFF_EMAIL_TAKEN',
    );
    db.branch.findFirst.mockResolvedValueOnce(null);
    expect(await failure(inContext(() => service.createStaffMember(dto)))).toBe(
      '400 BRANCH_NOT_FOUND',
    );
    db.user.update.mockRejectedValueOnce(new Error('boom'));
    await expect(inContext(() => service.updateStaffMember('w1', { name: 'x' }))).rejects.toThrow(
      'boom',
    );
  });

  it('writes only changed fields, guarded by the state the rules saw', async () => {
    await inContext(() => service.updateStaffMember('w1', { isActive: false }));
    expect(firstArg(db.user.update)).toEqual({
      where: { id: 'w1', role: 'WORKER', branchId: 'branch-1', isActive: true },
      data: { isActive: false },
      select: expect.anything() as unknown,
    });
    expect(db.branch.findFirst).not.toHaveBeenCalled();
    db.user.update.mockClear();
    await inContext(() => service.updateStaffMember('w1', { role: 'WORKER' }));
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('maps a concurrent change to 409 STAFF_CHANGED', async () => {
    db.user.update.mockRejectedValueOnce({ code: 'P2025' });
    expect(await failure(inContext(() => service.updateStaffMember('w1', { name: 'x' })))).toBe(
      '409 STAFF_CHANGED',
    );
  });

  it('checks the branch when moving or reactivating', async () => {
    await inContext(() => service.updateStaffMember('w1', { branchId: 'branch-2' }));
    expect(db.branch.findFirst).toHaveBeenCalledTimes(1);
    db.user.findFirst.mockResolvedValueOnce({ ...ROW, isActive: false, isDemo: false });
    db.branch.findFirst.mockResolvedValueOnce(null);
    expect(
      await failure(inContext(() => service.updateStaffMember('w1', { isActive: true }))),
    ).toBe('400 BRANCH_NOT_FOUND');
  });

  it('404s an unknown id on update', async () => {
    db.user.findFirst.mockResolvedValueOnce(null);
    expect(await failure(inContext(() => service.updateStaffMember('x', {})))).toBe(
      '404 STAFF_NOT_FOUND',
    );
  });

  it('refuses a caller without an actor', async () => {
    expect(
      await failure(inContext(() => service.listStaff({}), { ...ADMIN_CTX, actor: null })),
    ).toBe('401 AUTH_REQUIRED');
  });
});
