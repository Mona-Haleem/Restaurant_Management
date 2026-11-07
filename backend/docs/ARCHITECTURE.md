# Tablz API — Architecture (Backend Phase 1)

The working digest Claude builds against. Ticket requirements and acceptance criteria live in `docs/ROADMAP.md`; product intent lives in `docs/PRD.md`. This file holds the rules that cut across tickets, plus the open questions that must be answered before the tickets they block.

When this file and the roadmap disagree, the roadmap wins and this file gets fixed. Every decision taken while answering an open question is recorded as an ADR in `docs/adr/` and the question below is marked resolved with a link.

---

## 1. Scope

**In scope (Backend Phase 1):** menu and categories with ingredients, inventory items and the ledger, orders on the configurable workflow, waste, restock, reconciliation with snapshots, staff with simple roles, reports/KPIs/anomalies, health checks, environments, CI/CD, keep-alive and backups.

**Out of scope — do not build, but keep the seams:**

| Not now | Seam that must exist now |
| --- | --- |
| JWT login, password reset | One swappable request-context provider (§3). Passwords are already hashed and stored (B1001). |
| Detailed per-user permissions | `role_permissions` and `user_permission_overrides` tables exist, unenforced. |
| Customer accounts | `placed_by_type` already supports CUSTOMER; Phase 1 writes GUEST. |
| Offline replay | Idempotent deductions via the unique key (§5). |
| Combos, offers, reservations, Paymob, notifications/SSE, tenant onboarding | `is_combo` column reserved; nothing else. |
| Ledger compaction (PRD §7.4) | Deferred; archive-only rules in [ADR 0010](adr/0010-ledger-compaction-deferred.md). |

The PRD's §10 line "real backend (Express, Mongo, Mongoose)" is superseded by the roadmap: NestJS + Prisma + PostgreSQL.

---

## 2. Module map

| Module | Owns | Tickets | Depends on |
| --- | --- | --- | --- |
| `config` | env schema, fail-fast validation, `APP_ENV` guard | B201, B501 | — |
| `prisma` | PrismaService (unscoped, platform only), `TENANT_DB` tenant-scoped client extension ([ADR 0018](adr/0018-tenant-access-defaults-and-rate-limit.md)) | B301, B503 | config |
| `context` | request context provider (tenant, branch, actor, role), `TenantAccessGuard` (roles + demo-only writes), context store, `GET /:tenantSlug/context` | B503 | prisma |
| `health` | `/health`, `/health/db` | B503 | prisma |
| `catalog` | categories, menu items, menu-item ingredients, customer menu ([ADR 0019](adr/0019-catalog-rules.md)) | B601 | context |
| `inventory` | inventory items, components, **ledger service** (only writer of `current_stock`, [ADR 0020](adr/0020-ledger-service-contract.md)), stock queries, restock, menu availability ([ADR 0021](adr/0021-stock-view-and-restock.md)) | B701, B702 | context |
| `orders` | workflow stages, order lifecycle, stage history ([ADR 0022](adr/0022-order-lifecycle.md)), board/tracking queries with ETag polling ([ADR 0024](adr/0024-order-polling-and-board.md)) | B801, B802 | catalog, inventory |
| `waste` | waste entries (via the ledger service) | B901 | inventory |
| `reconciliation` | reconciliation entries, ADJUSTMENT rows, snapshots | B902 | inventory |
| `staff` | users, roles, activation, argon2 password hashes ([ADR 0023](adr/0023-staff-management-rules.md)) | B1001 | context |
| `reports` | KPIs, aggregates, anomaly detection (pure functions) | B1101 | orders, inventory, waste |

Folder shape per module: `src/modules/<module>/` with `<module>.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`, and tests beside the code (`*.spec.ts`). Cross-cutting code lives in `src/common/` (exception filter, interceptors, pipes, decorators, rate limit). Platform modules that may use the unscoped client live outside `src/modules/`: `src/config/`, `src/prisma/`, `src/context/`, `src/health/`; ESLint forbids `src/modules/**` from importing `PrismaService`. Integration tests live in `test/`.

---

## 3. Request flow and the auth seam

```
request
  → RequestContextProvider   resolves { tenantId, branchId?, actorId?, role? }  (Phase 1: path slug + dev headers, ADR 0007; Phase 2: JWT)
  → RoleGuard                 checks the route's required roles against context.role
  → ValidationPipe            DTO validation, whitelist + forbidNonWhitelisted
  → Controller (thin)         maps HTTP ↔ service calls
  → Service                   business rules; uses the tenant-scoped Prisma client only
  → Exception filter          every error → { code, message, details }, no stack traces
```

Rules:

- Guards and services read the context object, never a header. Swapping dev headers for JWT in Phase 2 must touch only the provider.
- Feature code never imports the unscoped Prisma client. The tenant extension is the only path to the database.
- Writes are allowed only on the demo tenant until JWT ships (B503 known risk): `403 DEMO_READ_ONLY` elsewhere.
- Tenant routes are staff-only unless `@AllowGuest()`; `@Roles(...)` narrows them. Rate limit runs first, health routes are exempt ([ADR 0018](adr/0018-tenant-access-defaults-and-rate-limit.md)).
- The scheduled staging reseed resets the demo tenant only ([ADR 0017](adr/0017-demo-tenant-reset.md), built in B1202).
- No Postgres RLS in Phase 1; isolation is the extension plus composite FKs ([ADR 0015](adr/0015-tenant-isolation-without-rls.md)).

**Phase 1 role capabilities (simple mode, PRD §7.1):**

| Caller | Can |
| --- | --- |
| ADMIN | everything in the tenant |
| MANAGER | everything within their branch |
| WORKER | view, place, advance and cancel orders; log waste |
| Guest (no role) | read the public menu, place an order, track/cancel their own order by tracking token ([ADR 0008](adr/0008-guest-order-tracking-token.md)) |

---

## 4. Data model notes

The table list is in ROADMAP §4. Cross-cutting rules:

- `uuid` primary keys; `tenant_id` on every tenant-owned table; indexes start with `tenant_id`.
- Scope ([ADR 0004](adr/0004-tenant-definitions-branch-stock.md)): item and menu definitions are tenant-wide; stock lives in `branch_stock (branch, item)`; `menu_items.branch_id` NULL = all branches; orders, ledger rows, snapshots, waste and reconciliation carry `branch_id`.
- Foreign keys between tenant-owned tables are composite and include `tenant_id`, so a row can never reference another tenant's row.
- Money and stock are Postgres `numeric` / Prisma `Decimal`. No JS `number` arithmetic on them anywhere, including tests.
- `created_at`, `updated_at` everywhere. Archive or deactivate instead of delete.
- `order_items` copy name and unit price at order time, so menu edits never rewrite history.
- Units: enum `G | KG | ML | L | PCS`; ledger values are always in the item's stock unit; other same-dimension inputs are converted at the edge ([ADR 0003](adr/0003-units-convert-within-dimension.md)).
- Prisma cannot express check constraints: create the migration with `--create-only`, add the `CHECK` SQL, then apply.
- Default stage keys are `pending`, `in-preparation`, `ready`, `delivered`, matching the Angular app ([ADR 0009](adr/0009-default-stage-keys.md)). `cancelled` is not a stage; it is derived from `canceled_at`.

---

## 5. Inventory ledger rules

- **Single writer.** Only the ledger service (B701) changes `branch_stock.current_stock`. Orders, waste, restock and reconciliation all call it. The demo seed is the one exception ([ADR 0016](adr/0016-demo-seed.md)).
- **Atomic.** The stock update and its `inventory_transactions` rows are written in one database transaction, using atomic `UPDATE … SET current_stock = current_stock + $delta` or row locks.
- **Idempotent order deductions.** Unique key on `(related_order_id, inventory_item_id, type)`. Consequence: a deduction must aggregate quantities per inventory item before writing. Two menu items that both use cheese, or a MIXED sauce and a raw ingredient that share a component, produce one CONSUMPTION row per item per order, not one per recipe line.
- **Expected stock** (per branch and item) = latest snapshot value + sum of `quantity_delta` since that snapshot. Implement the arithmetic as a pure function and test it over randomized sequences (B701 acceptance).
- **Negative stock** ([ADR 0006](adr/0006-negative-stock-allow-and-flag.md)): deductions are never refused for lack of stock; `current_stock` may go below zero and is flagged.
- **Cost** ([ADR 0005](adr/0005-cost-basis-moving-average.md)): every ledger row stores `unit_cost` at write time; PURCHASE updates `branch_stock.avg_unit_cost` (weighted moving average) in the same transaction; other types use the average, else the item's `standard_unit_cost`.
- **Reconciliation** writes, in one transaction: the reconciliation entry, an ADJUSTMENT row for the unexplained gap, and a new snapshot. Logged waste is already in the ledger, so it is never part of the gap.
- **MIXED items** — derived stock in Phase 1 ([ADR 0002](adr/0002-mixed-items-derived-stock.md)): no own `current_stock`, never in the ledger; a deduction expands one level into RAW/READY components, then aggregates per item.

---

## 6. Order workflow rules

- Stages are rows in `order_workflow_stages` (per tenant: key, label, position, `cancellable`, `deducts_inventory`; [ADR 0014](adr/0014-workflow-stages-as-table.md)). Four defaults are seeded per tenant.
- **Behavior comes from flags and position only.** No code compares a stage key or label. A test that reorders or renames the stages in its fixture must pass unchanged (B801 acceptance).
- Advance = move to the next stage by position. Reaching a stage flagged `deducts_inventory` calls the ledger service in the same transaction.
- Cancel = allowed only while the current stage is `cancellable`; sets `canceled_at`; no inventory change.
- Every transition writes `order_stage_history`.
- Board/tracking polling uses an ETag: an unchanged poll with `If-None-Match` gets 304 without loading any order (B802, [ADR 0024](adr/0024-order-polling-and-board.md)). The board lists active orders (not cancelled, not in the last stage by position) by default.

---

## 7. API conventions

- All routes under `/v1`; tenant routes under `/v1/:tenantSlug/` ([ADR 0007](adr/0007-request-context-slug-and-demo-users.md)). OpenAPI generated from decorators and committed as `openapi.json` with a drift test ([ADR 0012](adr/0012-openapi-contract.md)); the spec is the contract for the Angular client and the frontend mocks (B502).
- Input: one DTO per request body/query, validated globally.
- Errors: `{ "code": "ORDER_NOT_CANCELLABLE", "message": "…", "details": { … } }`. Codes are stable strings the frontend can switch on.
- Decimals are serialized as strings in JSON, so the frontend never receives a rounded float. Confirmed in [ADR 0013](adr/0013-numeric-precision.md); `bigint` values are strings too. Inputs use `IsDecimalString`, outputs `formatDecimal` (`src/common/decimal`).

---

## 8. Testing strategy

- **TDD per ticket.** Tests are written from the acceptance criteria before the implementation.
- **Unit:** pure functions (expected stock, reconciliation gap, anomaly detection, stage transitions) with no database.
- **Integration (Jest + Supertest):** against real Postgres (local container / CI service container). Never mock Prisma for ledger, order or tenancy logic.
- **Required suites that must never be deleted:**
  - cross-tenant isolation, parametrized over every endpoint (B503)
  - concurrent double delivery deducts once (B701, B801)
  - mid-cascade failure leaves no partial rows (B701)
  - randomized ledger sequences: stock = snapshot + transactions since (B701)
  - logged waste is not double-counted in reconciliation (B902)

---

## 9. Environments

See ROADMAP §2, [`docs/ENVIRONMENTS.md`](ENVIRONMENTS.md) and [ADR 0011](adr/0011-environment-guards.md). Short version for Claude: work only against local Docker Postgres (`tablz_dev`) and the test database (`tablz_test`), both on `localhost:5433`. Staging and production are reached only by CI. The boot guard and `prisma.config.ts` enforce this; never weaken them to get a command through.

---

## 10. Open questions

Raised while turning the PRD and roadmap into this kit. Each blocks the tickets listed. Answer in an ADR, then mark it resolved here. **All ten resolved on 2026-11-06 (ADRs 0001–0010).**

| # | Question | Why it matters | Blocks |
| --- | --- | --- | --- |
| Q1 | ✅ **Resolved — [ADR 0001](adr/0001-monorepo-layout.md): monorepo, API in `backend/`.** ~~Repo layout: separate `tablz-api` repo, or a monorepo with the Angular app?~~ | Decides where this kit lives, and whether TABLZ-401 models, the TABLZ-404 seed and the frontend mocks are reachable from this repo. | B101, B302, B401, B502 |
| Q2 | ✅ **Resolved — [ADR 0007](adr/0007-request-context-slug-and-demo-users.md): tenant from `/v1/:tenantSlug/...`; `x-dev-role` → the tenant's demo user (actor), optional `x-dev-user`; branch from the user, `x-dev-branch` for ADMIN, or the only branch.** ~~Phase 1 tenant/branch/actor resolution.~~ The roadmap names `x-dev-role` only. Is the tenant a fixed demo tenant from config, an `x-dev-tenant` header, or the slug in the path (`/restaurant-name`, PRD §13)? Which user is the actor, given `actor_id` is required on ledger rows? | Every request and every ledger row depends on it. | B503 and everything after |
| Q3 | ✅ **Resolved — [ADR 0002](adr/0002-mixed-items-derived-stock.md): derived stock in Phase 1 (cascade to RAW/READY components), batch production deferred.** ~~MIXED items.~~ PRD §8.3 says preparing a mixed item deducts raw stock and adds to the prepared item's own stock (it is stocked). PRD §14.2 says its stock is derived, not directly stocked. Roadmap B701 says deducting a MIXED item cascades to its raw components. Which model? If stocked, the transaction enum has no PRODUCTION/PREP type. | Changes whether MIXED items have their own `current_stock`, the enum, and the cascade logic. | B301, B701 |
| Q4 | ✅ **Resolved — [ADR 0003](adr/0003-units-convert-within-dimension.md): fixed unit enum (G/KG, ML/L, PCS), exact conversion within a dimension, ledger always in the item's stock unit.** ~~Units.~~ `menu_item_ingredients` has its own unit and so do `inventory_items`. Must they match (validated), or is conversion needed (g vs kg)? | Wrong units silently corrupt stock. | B301, B601, B701 |
| Q5 | ✅ **Resolved — [ADR 0004](adr/0004-tenant-definitions-branch-stock.md): tenant-wide item/menu definitions, stock in `branch_stock` per (branch, item), `menu_items.branch_id` nullable, ledger/orders carry `branch_id`.** ~~Menu and inventory scope.~~ PRD §4 says menu and inventory are per branch; PRD §8.3 allows "single or multiple inventories per branch". The roadmap tables show no `branch_id` on `menu_items` / `inventory_items` and no inventory-location table. Per tenant, per branch, or per location? | Hard to retrofit; Phase 3 archetypes need both shared and per-branch menus. | B301 |
| Q6 | ✅ **Resolved — [ADR 0006](adr/0006-negative-stock-allow-and-flag.md): allow and flag; never block or clamp a deduction.** ~~Negative stock.~~ If a delivery would take stock below zero: block, allow and flag, or clamp? (Already an ADR in B302.) | Blocking would stop a real kitchen mid-service. | B302, B701 |
| Q7 | ✅ **Resolved — [ADR 0008](adr/0008-guest-order-tracking-token.md): random tracking token returned once at checkout, stored as a SHA-256 hash; guest routes take the token.** ~~Guest order access.~~ Guests have no account. How does a guest track or cancel only their own order — for example an unguessable tracking token returned at checkout? | Without it, anyone with an order id can cancel it. | B801, B802 |
| Q8 | ✅ **Resolved — [ADR 0010](adr/0010-ledger-compaction-deferred.md): deferred to Phase 2; future compaction is snapshot + archive only, never delete, idempotency kept.** ~~Ledger compaction~~ (PRD §7.4) is in the PRD but in no roadmap ticket. Defer to Phase 2, or add a ticket? | Affects whether old rows can ever be removed and how that interacts with the idempotency key. | none now; decide before B14 |
| Q9 | ✅ **Resolved — [ADR 0009](adr/0009-default-stage-keys.md): `pending`, `in-preparation`, `ready`, `delivered` (the Angular app's keys); `cancelled` is derived from `canceled_at`.** ~~Stage keys.~~ Use PRD §7.3's `pending / preparing / ready / completed`, or §4's `PENDING / IN_PREPARATION / READY / DELIVERED`? | Seed, frontend mock and contract tests must agree. | B401, B801 |
| Q10 | ✅ **Resolved — [ADR 0005](adr/0005-cost-basis-moving-average.md): `unit_cost` on every ledger row, weighted moving average on `branch_stock`, `standard_unit_cost` fallback on the item.** ~~Cost basis for waste-cost KPI.~~ `inventory_items` has no cost column; the restock form mentions cost. Is cost a field on the item, on each PURCHASE row (with averaging), or both? | B1101 cannot compute waste cost without it. | B301, B702, B1101 |
