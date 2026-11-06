import { AppException } from '../../common/errors/app-exception';
import {
  resolveStaffChange,
  staffVisibilityBranch,
  type StaffCaller,
  type StaffState,
} from './staff-rules';

const BRANCH_A = '00000000-0000-4000-8000-00000000000a';
const BRANCH_B = '00000000-0000-4000-8000-00000000000b';

const admin: StaffCaller = { id: 'admin', role: 'ADMIN', branchId: BRANCH_A };
const manager: StaffCaller = { id: 'manager', role: 'MANAGER', branchId: BRANCH_A };

const worker = (overrides: Partial<StaffState> = {}): StaffState => ({
  id: 'w1',
  role: 'WORKER',
  branchId: BRANCH_A,
  isActive: true,
  isDemo: false,
  ...overrides,
});

function codeOf(run: () => unknown): { status: number; code: string } {
  try {
    run();
  } catch (error) {
    if (error instanceof AppException) return { status: error.getStatus(), code: error.code };
    throw error;
  }
  throw new Error('expected an AppException');
}

describe('staffVisibilityBranch', () => {
  it('lets an ADMIN see the whole tenant and a MANAGER only their branch', () => {
    expect(staffVisibilityBranch(admin)).toBeUndefined();
    expect(staffVisibilityBranch(manager)).toBe(BRANCH_A);
  });
});

describe('resolveStaffChange — create', () => {
  it('gives a new ADMIN no branch, and refuses one', () => {
    expect(resolveStaffChange(admin, null, { role: 'ADMIN' }, BRANCH_A)).toEqual({
      role: 'ADMIN',
      branchId: null,
      isActive: true,
    });
    expect(
      codeOf(() => resolveStaffChange(admin, null, { role: 'ADMIN', branchId: BRANCH_A }, null)),
    ).toEqual({ status: 400, code: 'BRANCH_NOT_ALLOWED' });
  });

  it('puts a MANAGER or WORKER in the given branch, else the default one, else refuses', () => {
    expect(
      resolveStaffChange(admin, null, { role: 'MANAGER', branchId: BRANCH_B }, BRANCH_A),
    ).toMatchObject({ role: 'MANAGER', branchId: BRANCH_B });
    expect(resolveStaffChange(admin, null, { role: 'WORKER' }, BRANCH_A)).toMatchObject({
      branchId: BRANCH_A,
    });
    expect(codeOf(() => resolveStaffChange(admin, null, { role: 'WORKER' }, null))).toEqual({
      status: 400,
      code: 'BRANCH_REQUIRED',
    });
    expect(
      codeOf(() => resolveStaffChange(admin, null, { role: 'WORKER', branchId: null }, BRANCH_A)),
    ).toEqual({ status: 400, code: 'BRANCH_REQUIRED' });
  });

  it('lets a MANAGER create only WORKERs in their own branch', () => {
    expect(resolveStaffChange(manager, null, { role: 'WORKER' }, BRANCH_A)).toEqual({
      role: 'WORKER',
      branchId: BRANCH_A,
      isActive: true,
    });
    for (const change of [
      { role: 'MANAGER' as const },
      { role: 'ADMIN' as const },
      { role: 'WORKER' as const, branchId: BRANCH_B },
    ]) {
      expect(codeOf(() => resolveStaffChange(manager, null, change, BRANCH_A))).toEqual({
        status: 403,
        code: 'STAFF_FORBIDDEN',
      });
    }
  });
});

describe('resolveStaffChange — update', () => {
  it('keeps what is not sent', () => {
    expect(resolveStaffChange(admin, worker(), {}, null)).toEqual({
      role: 'WORKER',
      branchId: BRANCH_A,
      isActive: true,
    });
  });

  it('assigns roles: promoting to ADMIN drops the branch, demoting needs one', () => {
    expect(resolveStaffChange(admin, worker(), { role: 'MANAGER' }, null)).toMatchObject({
      role: 'MANAGER',
      branchId: BRANCH_A,
    });
    expect(resolveStaffChange(admin, worker(), { role: 'ADMIN' }, null)).toMatchObject({
      role: 'ADMIN',
      branchId: null,
    });
    const anAdmin = worker({ role: 'ADMIN', branchId: null });
    expect(codeOf(() => resolveStaffChange(admin, anAdmin, { role: 'WORKER' }, null))).toEqual({
      status: 400,
      code: 'BRANCH_REQUIRED',
    });
    expect(
      resolveStaffChange(admin, anAdmin, { role: 'WORKER', branchId: BRANCH_B }, null),
    ).toMatchObject({ role: 'WORKER', branchId: BRANCH_B });
  });

  it('deactivates and reactivates (never deletes)', () => {
    expect(resolveStaffChange(admin, worker(), { isActive: false }, null).isActive).toBe(false);
    const inactive = worker({ isActive: false });
    expect(resolveStaffChange(admin, inactive, { isActive: true }, null).isActive).toBe(true);
  });

  it('lets a MANAGER deactivate a worker of their branch, but not promote or move them', () => {
    expect(resolveStaffChange(manager, worker(), { isActive: false }, BRANCH_A).isActive).toBe(
      false,
    );
    for (const change of [{ role: 'MANAGER' as const }, { branchId: BRANCH_B }]) {
      expect(codeOf(() => resolveStaffChange(manager, worker(), change, BRANCH_A))).toEqual({
        status: 403,
        code: 'STAFF_FORBIDDEN',
      });
    }
  });

  it('refuses a MANAGER editing a MANAGER, an ADMIN, or a worker of another branch', () => {
    const targets = [
      worker({ role: 'MANAGER' }),
      worker({ role: 'ADMIN', branchId: null }),
      worker({ branchId: BRANCH_B }),
    ];
    for (const target of targets) {
      expect(codeOf(() => resolveStaffChange(manager, target, {}, BRANCH_A))).toEqual({
        status: 403,
        code: 'STAFF_FORBIDDEN',
      });
    }
  });

  it('protects demo users from deactivation and role changes, not from renames', () => {
    const demo = worker({ isDemo: true });
    expect(codeOf(() => resolveStaffChange(admin, demo, { isActive: false }, null))).toEqual({
      status: 409,
      code: 'DEMO_USER_PROTECTED',
    });
    expect(codeOf(() => resolveStaffChange(admin, demo, { role: 'MANAGER' }, null))).toEqual({
      status: 409,
      code: 'DEMO_USER_PROTECTED',
    });
    expect(resolveStaffChange(admin, demo, { role: 'WORKER', isActive: true }, null)).toEqual({
      role: 'WORKER',
      branchId: BRANCH_A,
      isActive: true,
    });
  });

  it('refuses deactivating yourself', () => {
    const self = worker({ id: admin.id, role: 'ADMIN', branchId: null });
    expect(codeOf(() => resolveStaffChange(admin, self, { isActive: false }, null))).toEqual({
      status: 409,
      code: 'CANNOT_DEACTIVATE_SELF',
    });
  });
});
