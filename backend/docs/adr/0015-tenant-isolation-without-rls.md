# ADR 0015 — Tenant isolation in the app layer; Postgres RLS deferred

- **Status:** accepted
- **Date:** 2026-11-06
- **Answers:** ROADMAP §4 / B302 "RLS decision" · **Tickets:** B301, B302, B503, B1401

## Context

Every tenant-owned table has `tenant_id` (CLAUDE.md rule 1). The roadmap (§4) says tenant scoping is enforced in the application layer in Phase 1, and RLS is a hardening ticket. B302 asks for that decision to be written down.

Postgres row-level security does not apply to a table's owner (unless the table has `FORCE ROW LEVEL SECURITY`) or to a role with `BYPASSRLS`. Prisma connects with one role, normally the owner that ran the migrations, so RLS policies would be skipped unless every request switches to a restricted role and sets the tenant (`SET LOCAL ROLE …; SET LOCAL app.tenant_id = …`) inside a transaction. With Supabase's pooler (Supavisor, transaction mode) that also means every query must run inside an explicit transaction.

## Options considered

1. **App layer only** — a Prisma client extension adds `tenant_id` to every read and write; composite FKs `(tenant_id, x) → (tenant_id, id)` stop cross-tenant references in the database. Cheap; a missed query in code is the risk.
2. **RLS now** — policies on every table, a non-owner app role, per-request `SET LOCAL` in a wrapping transaction. Defence in depth, but every query becomes a transaction, the seed and migrations need a second role, and Supabase setup grows before any feature exists.
3. **App layer now, RLS later** — option 1, with the schema kept ready for policies.

## Decision

Option 3. Phase 1 enforces isolation with:

- the tenant-scoped Prisma client extension (B503), the only path to the database from feature code;
- composite tenant FKs and `@@unique([tenantId, id])` on every table (B301, checked by `schema-rules.spec.ts`);
- the cross-tenant isolation suite parametrized over every endpoint (B503, a required suite).

No RLS policies in Phase 1.

## Consequences

- The isolation suite is the main safety net; it must cover every new endpoint (ARCHITECTURE §8).
- A raw SQL query (`$queryRaw`) bypasses the extension. Feature code must not use one without adding the `tenant_id` filter by hand, and a reviewer checks every such query.
- Revisit in B1401 (final hardening) or Phase 2 with JWT: add a non-owner app role (or `FORCE ROW LEVEL SECURITY`), policies `USING (tenant_id = current_setting('app.tenant_id')::uuid)`, and set the tenant per transaction. The schema needs no change for that: every tenant-owned table already has `tenant_id` (`tenants` and `app_environment` have none).
