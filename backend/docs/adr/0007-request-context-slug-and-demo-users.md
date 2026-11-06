# ADR 0007 — Request context: tenant slug in the path, dev role mapped to a demo user

- **Status:** accepted
- **Date:** 2026-11-06
- **Answers:** ARCHITECTURE §10 Q2 · **Tickets:** B301, B401, B502, B503, and every feature ticket after

## Context

Phase 1 has no login. ROADMAP §1 names a dev header (`x-dev-role`) read by one swappable provider (ARCHITECTURE §3). Open points: where the tenant comes from, which branch a write belongs to ([ADR 0004](0004-tenant-definitions-branch-stock.md) puts `branch_id` on orders and ledger rows), and who the actor is (`actor_id` is required on ledger rows). Constraints:

- B503 acceptance: a parametrized test proves tenant A cannot read or write tenant B's rows through any endpoint — so the tenant must vary per request.
- PRD storefront: each restaurant lives at `tablz.com/restaurant-name`.
- Only staff write the ledger (advance, waste, restock, reconciliation); guests place, track and cancel orders, none of which touches stock.

## Options considered

1. **Fixed demo tenant from config + `x-dev-role`** — simplest; cannot express the cross-tenant endpoint test.
2. **All dev headers** (`x-dev-tenant`, `x-dev-branch`, `x-dev-role`, `x-dev-user`) — uniform; public routes need headers, unlike the storefront URL.
3. **Slug in the path + role mapped to a seeded demo user** — matches the storefront; actor is always a real user.

## Decision

Option 3. The `RequestContextProvider` builds `{ tenantId, branchId?, actorId?, role? }`:

- **Tenant:** every tenant route is `/v1/:tenantSlug/...`. Unknown slug → 404 `TENANT_NOT_FOUND`. Non-tenant routes (`/health`, `/health/db`) sit outside it.
- **Role and actor:** `x-dev-role: ADMIN | MANAGER | WORKER` selects the tenant's seeded demo user with that role; that user is the actor. Optional `x-dev-user: <uuid>` selects a specific active user of the tenant instead (role then comes from the user). An invalid value → 401 `DEV_IDENTITY_INVALID`. No headers = guest (no role, no actor).
- **Branch:** MANAGER and WORKER use their `users.branch_id`. ADMIN uses `x-dev-branch: <uuid>` if sent, else the tenant's only branch if there is exactly one, else branch-scoped writes fail with 400 `BRANCH_REQUIRED`. Guests use the tenant's only branch in Phase 1 (branch picker is Phase 2).
- Guards and services read only the context object, never headers (ARCHITECTURE §3).

## Consequences

- **Schema (B301):** `users.branch_id` nullable, composite FK to `branches`; CHECK: `role = 'ADMIN' OR branch_id IS NOT NULL`. `tenants.slug` unique (already in ROADMAP §4). Optional `users.is_demo` flag to find demo users without matching names.
- **Seed (B401):** per tenant, one active demo user per role (manager and worker on the seeded branch). The second test tenant gets the same, so B503's isolation test can run.
- **OpenAPI (B502):** `tenantSlug` is a path parameter on every tenant route; the `x-dev-*` headers are documented as Phase 1 only.
- **Ledger:** `actor_id` is always a staff user. A guest-triggered action that would write the ledger cannot exist in Phase 1; the provider refuses a guest on routes that require a role.
- **Demo safety (B503):** "writes only on the demo tenant" checks `tenantId` from the context.
- **Phase 2 (JWT):** only the provider changes — it reads the user from the token and rejects it if the user's tenant does not match `:tenantSlug` (`TENANT_MISMATCH`). The `x-dev-*` headers are removed. Guards are unchanged.
- **Risk:** anyone can claim any role with a header in Phase 1. Accepted for the demo; mitigated by demo-tenant-only writes, rate limiting and the scheduled reseed (B503).
