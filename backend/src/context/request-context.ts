import type { UserRole } from '../generated/prisma/enums';

export interface RequestActor {
  id: string;
  name: string;
  role: UserRole;
}

/**
 * Who is calling, for which tenant and branch (ARCHITECTURE §3). Built once per request by the
 * RequestContextProvider; guards and services read this object, never a header.
 */
export interface RequestContext {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  /** Phase 1: only the demo tenant accepts writes (ADR 0007). */
  isDemoTenant: boolean;
  /** Null when the caller has no branch yet (an ADMIN of a multi-branch tenant). */
  branchId: string | null;
  /** Null for a guest. */
  actor: RequestActor | null;
}
