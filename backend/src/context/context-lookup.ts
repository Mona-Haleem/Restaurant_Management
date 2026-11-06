import { Injectable } from '@nestjs/common';
import type { UserRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

export interface LookupTenant {
  id: string;
  slug: string;
  name: string;
  isDemo: boolean;
  isActive: boolean;
}

export interface LookupUser {
  id: string;
  name: string;
  role: UserRole;
  branchId: string | null;
}

/** What the context provider needs from the database, behind a port so it is unit-testable. */
export interface ContextLookup {
  findTenantBySlug(slug: string): Promise<LookupTenant | null>;
  /** The tenant's active demo user with this role (the oldest, if several). */
  findDemoUser(tenantId: string, role: UserRole): Promise<LookupUser | null>;
  findActiveUser(tenantId: string, userId: string): Promise<LookupUser | null>;
  findActiveBranchIds(tenantId: string): Promise<string[]>;
}

const USER_FIELDS = { id: true, name: true, role: true, branchId: true } as const;

/**
 * Uses the unscoped client on purpose: it runs before there is a tenant context, and every query
 * names the tenant explicitly.
 */
@Injectable()
export class PrismaContextLookup implements ContextLookup {
  constructor(private readonly prisma: PrismaService) {}

  findTenantBySlug(slug: string): Promise<LookupTenant | null> {
    return this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true, isDemo: true, isActive: true },
    });
  }

  findDemoUser(tenantId: string, role: UserRole): Promise<LookupUser | null> {
    return this.prisma.user.findFirst({
      where: { tenantId, role, isDemo: true, isActive: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: USER_FIELDS,
    });
  }

  findActiveUser(tenantId: string, userId: string): Promise<LookupUser | null> {
    return this.prisma.user.findFirst({
      where: { tenantId, id: userId, isActive: true },
      select: USER_FIELDS,
    });
  }

  async findActiveBranchIds(tenantId: string): Promise<string[]> {
    const rows = await this.prisma.branch.findMany({
      where: { tenantId, isActive: true },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}
