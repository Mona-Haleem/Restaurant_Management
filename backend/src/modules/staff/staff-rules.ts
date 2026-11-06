import { AppException } from '../../common/errors/app-exception';
import type { UserRole } from '../../generated/prisma/enums';

/** The staff member making the change (from the request context). */
export interface StaffCaller {
  id: string;
  role: UserRole;
  branchId: string | null;
}

/** The fields of a staff member that the rules look at. */
export interface StaffState {
  id: string;
  role: UserRole;
  branchId: string | null;
  isActive: boolean;
  isDemo: boolean;
}

/** What a create or edit asks for; an absent field is unchanged (or defaulted on create). */
export interface StaffChange {
  role?: UserRole;
  /** `null` = no branch (ADMIN only). */
  branchId?: string | null;
  isActive?: boolean;
}

export interface ResolvedStaff {
  role: UserRole;
  branchId: string | null;
  isActive: boolean;
}

/**
 * The branch whose staff the caller may see: `undefined` = the whole tenant (ADMIN); a MANAGER
 * sees their own branch only (ADR 0023).
 */
export function staffVisibilityBranch(caller: StaffCaller): string | null | undefined {
  return caller.role === 'ADMIN' ? undefined : caller.branchId;
}

const forbidden = (): AppException =>
  new AppException(403, 'STAFF_FORBIDDEN', 'A manager may only manage workers of their branch.');

/**
 * The staff rules of B1001 (ADR 0023), as a pure function. `current` is null on create;
 * `defaultBranchId` is used when a MANAGER/WORKER gets no branch (the caller's branch).
 * Throws an AppException for a change that is not allowed; returns the resulting state otherwise.
 */
export function resolveStaffChange(
  caller: StaffCaller,
  current: StaffState | null,
  change: StaffChange,
  defaultBranchId: string | null,
): ResolvedStaff {
  const role = change.role ?? current?.role;
  if (!role) throw new Error('resolveStaffChange: a new staff member needs a role');

  let branchId: string | null;
  if (change.branchId !== undefined) branchId = change.branchId;
  else if (role === 'ADMIN') branchId = null;
  else branchId = current?.branchId ?? defaultBranchId;

  if (caller.role !== 'ADMIN') {
    const targetIsOwnWorker =
      !current || (current.role === 'WORKER' && current.branchId === caller.branchId);
    if (!targetIsOwnWorker || role !== 'WORKER' || branchId !== caller.branchId) throw forbidden();
  }

  if (role === 'ADMIN' && branchId !== null) {
    throw new AppException(400, 'BRANCH_NOT_ALLOWED', 'An admin works across branches.', {
      branchId,
    });
  }
  if (role !== 'ADMIN' && branchId === null) {
    throw new AppException(400, 'BRANCH_REQUIRED', 'Managers and workers need a branch.', {
      role,
    });
  }

  const isActive = change.isActive ?? current?.isActive ?? true;
  if (current) {
    if (current.isDemo && (role !== current.role || !isActive)) {
      throw new AppException(
        409,
        'DEMO_USER_PROTECTED',
        'The demo users behind the role picker cannot be deactivated or change role.',
        { id: current.id },
      );
    }
    if (current.id === caller.id && !isActive) {
      throw new AppException(409, 'CANNOT_DEACTIVATE_SELF', 'You cannot deactivate yourself.');
    }
  }
  return { role, branchId, isActive };
}
