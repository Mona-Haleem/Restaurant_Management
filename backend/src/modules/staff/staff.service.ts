import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { AppException } from '../../common/errors/app-exception';
import { RequestContextStore } from '../../context/request-context.store';
import { TENANT_DB, type TenantDb } from '../../prisma/tenant-prisma';
import type {
  CreateStaffMemberDto,
  ListStaffQueryDto,
  StaffMemberDto,
  UpdateStaffMemberDto,
} from './dto/staff.dto';
import { hashPassword } from './password';
import { resolveStaffChange, staffVisibilityBranch, type StaffCaller } from './staff-rules';

const STAFF_FIELDS = {
  id: true,
  name: true,
  email: true,
  role: true,
  branchId: true,
  isActive: true,
  updatedAt: true,
} as const;

type StaffRow = Prisma.UserGetPayload<{ select: typeof STAFF_FIELDS }>;

/** Field by field, so a password hash can never reach a response even if a select widens. */
function toDto(row: StaffRow): StaffMemberDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    branchId: row.branchId,
    isActive: row.isActive,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'P2002';
}

/**
 * Staff management (B1001, ADR 0023): list, create, assign roles, deactivate. Never deletes:
 * a deactivated user keeps their row, so orders, history and ledger rows still show their name.
 * `role_permissions` / `user_permission_overrides` exist but are not enforced in Phase 1.
 */
@Injectable()
export class StaffService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantDb,
    private readonly context: RequestContextStore,
  ) {}

  /** The caller (always staff: the route needs a role) and their default branch. */
  private caller(): { caller: StaffCaller; defaultBranchId: string | null; tenantId: string } {
    const ctx = this.context.require();
    if (!ctx.actor) throw new AppException(401, 'AUTH_REQUIRED', 'Sign in as staff first.');
    return {
      caller: { id: ctx.actor.id, role: ctx.actor.role, branchId: ctx.branchId },
      defaultBranchId: ctx.branchId,
      tenantId: ctx.tenantId,
    };
  }

  /** Limits a query to the staff the caller may see (a MANAGER: their branch only). */
  private visible(caller: StaffCaller): Prisma.UserWhereInput {
    const branchId = staffVisibilityBranch(caller);
    return branchId === undefined ? {} : { branchId };
  }

  async listStaff(query: ListStaffQueryDto): Promise<StaffMemberDto[]> {
    const { caller } = this.caller();
    const rows = await this.db.user.findMany({
      where: {
        AND: [
          this.visible(caller),
          query.status ? { isActive: query.status === 'ACTIVE' } : {},
          query.role ? { role: query.role } : {},
          query.branchId ? { branchId: query.branchId } : {},
        ],
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { id: 'asc' }],
      select: STAFF_FIELDS,
    });
    return rows.map(toDto);
  }

  async getStaffMember(id: string): Promise<StaffMemberDto> {
    const { caller } = this.caller();
    const row = await this.db.user.findFirst({
      where: { AND: [{ id }, this.visible(caller)] },
      select: STAFF_FIELDS,
    });
    if (!row) throw this.notFound(id);
    return toDto(row);
  }

  async createStaffMember(dto: CreateStaffMemberDto): Promise<StaffMemberDto> {
    const { caller, defaultBranchId, tenantId } = this.caller();
    const resolved = resolveStaffChange(
      caller,
      null,
      { role: dto.role, branchId: dto.branchId },
      defaultBranchId,
    );
    if (resolved.branchId) await this.assertActiveBranch(resolved.branchId);
    const passwordHash = await hashPassword(dto.password);
    try {
      const row = await this.db.user.create({
        data: {
          tenantId,
          name: dto.name,
          email: dto.email ?? null,
          passwordHash,
          role: resolved.role,
          branchId: resolved.branchId,
          isActive: resolved.isActive,
        },
        select: STAFF_FIELDS,
      });
      return toDto(row);
    } catch (error) {
      throw this.emailTaken(error, dto.email);
    }
  }

  async updateStaffMember(id: string, dto: UpdateStaffMemberDto): Promise<StaffMemberDto> {
    const { caller, defaultBranchId } = this.caller();
    const current = await this.db.user.findFirst({
      where: { AND: [{ id }, this.visible(caller)] },
      select: { id: true, role: true, branchId: true, isActive: true, isDemo: true },
    });
    if (!current) throw this.notFound(id);
    const resolved = resolveStaffChange(
      caller,
      current,
      { role: dto.role, branchId: dto.branchId, isActive: dto.isActive },
      defaultBranchId,
    );
    const moved = resolved.branchId !== current.branchId;
    const reactivated = resolved.isActive && !current.isActive;
    if (resolved.branchId && (moved || reactivated)) {
      await this.assertActiveBranch(resolved.branchId);
    }
    // Only changed fields are written, so an empty PATCH does not bump updatedAt.
    const data: Prisma.UserUncheckedUpdateInput = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(resolved.role !== current.role && { role: resolved.role }),
      ...(moved && { branchId: resolved.branchId }),
      ...(resolved.isActive !== current.isActive && { isActive: resolved.isActive }),
    };
    if (Object.keys(data).length === 0) return this.getStaffMember(id);
    try {
      // The where repeats the state the rules were checked against: if a concurrent edit changed
      // it, nothing matches (P2025) and the caller retries instead of acting on stale rules.
      const row = await this.db.user.update({
        where: {
          id,
          role: current.role,
          branchId: current.branchId,
          isActive: current.isActive,
        },
        data,
        select: STAFF_FIELDS,
      });
      return toDto(row);
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code === 'P2025') {
        throw new AppException(
          409,
          'STAFF_CHANGED',
          'This staff member was changed meanwhile; reload and try again.',
          { id },
        );
      }
      throw this.emailTaken(error, dto.email);
    }
  }

  private async assertActiveBranch(branchId: string): Promise<void> {
    const branch = await this.db.branch.findFirst({
      where: { id: branchId, isActive: true },
      select: { id: true },
    });
    if (!branch) {
      throw new AppException(400, 'BRANCH_NOT_FOUND', 'No such active branch.', { branchId });
    }
  }

  private notFound(id: string): AppException {
    return new AppException(404, 'STAFF_NOT_FOUND', 'No such staff member.', { id });
  }

  private emailTaken(error: unknown, email: string | null | undefined): unknown {
    return isUniqueViolation(error)
      ? new AppException(409, 'STAFF_EMAIL_TAKEN', 'A staff member already uses this email.', {
          email,
        })
      : error;
  }
}
