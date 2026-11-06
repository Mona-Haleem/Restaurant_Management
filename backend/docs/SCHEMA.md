# Schema (B301)

The Prisma schema is `prisma/schema.prisma`; the diagram is [ERD.md](ERD.md), generated from the schema. This page explains the rules and the decisions behind the shape.

## Rules every table follows

`src/prisma/schema-rules.spec.ts` checks these on every `npm test`, so a new table that breaks one fails CI.

| Rule | How |
| --- | --- |
| uuid primary keys | `id String @id @default(uuid()) @db.Uuid` (only `app_environment` uses `id = 1`) |
| Tenant isolation (CLAUDE.md rule 1) | <ul><li>`tenant_id` (required uuid) on every table except `tenants` and `app_environment`</li><li>Every table has `@@unique([tenantId, id])`</li><li>Every index starts with `tenant_id`</li><li>Every FK between tenant-owned tables is composite `(tenant_id, x) → (tenant_id, id)`</li></ul>Postgres itself then refuses a row that points at another tenant's row. |
| No hard deletes (rule 5) | Every FK is `onDelete: Restrict`. Rows are archived or deactivated (`is_active`, `status`, `canceled_at`). |
| Decimals (rule 4) | <ul><li>Money: `numeric(12,2)`</li><li>Stock quantities: `numeric(14,3)`, i.e. 0.001 of a unit = 1 g on a KG item</li><li>Unit costs: `numeric(14,4)`</li><li>Never `Float`</li></ul>[ADR 0013](adr/0013-numeric-precision.md) records this choice. |
| Timestamps | `created_at`, `updated_at` on every table, all `timestamptz(3)`. Reports group by the tenant's local day (`tenants.timezone`). |
| Global unique keys | Only these three skip the leading `tenant_id`:<ul><li>the idempotency key</li><li>`inventory_transactions.seq`</li><li>`orders.tracking_token_hash`</li></ul>A test pins exactly this list. |
| Names | snake_case tables and columns via `@@map` / `@map`. |

## Decisions in the shape

- **Stock per branch** ([ADR 0004](adr/0004-tenant-definitions-branch-stock.md)):
  - `inventory_items` is the tenant-wide definition.
  - `branch_stock (branch, item)` holds `current_stock`, `low_stock_threshold` and `avg_unit_cost`.
  - MIXED items never get a `branch_stock` row ([ADR 0002](adr/0002-mixed-items-derived-stock.md)). The service enforces this, because a CHECK cannot look at another table.
- **Ledger ordering:** `inventory_transactions.seq` is a `bigserial`. A snapshot stores `through_seq`, the last ledger row it includes, so expected stock = `snapshot.quantity + Σ quantity_delta where seq > through_seq`.
  - This avoids timestamp ties: every row written in one transaction gets the same `now()`.
  - **Contract for B701 and B902:** a bigserial value is assigned at INSERT, not at commit, so the order of the writes matters.
    1. Lock or update the `branch_stock` row first.
    2. Only then insert the ledger rows.
    3. Reconciliation reads `max(seq)` for that (branch, item) while holding the same lock.

    If a row is inserted before the lock, a concurrent snapshot can record a `through_seq` above a row that has not committed yet, and that row would drop out of expected stock for good. B701's concurrency tests must cover this.
- **Idempotent deductions:** `UNIQUE (related_order_id, inventory_item_id, type)`.
  - It is one of three global unique keys (see the table above), because order ids are globally unique uuids. The ROADMAP §4 key is used unchanged.
  - Postgres allows many NULLs in it, so non-order rows aren't affected.
- **Reconciliation:**
  - `reconciliation_entries` points at its ADJUSTMENT row (NULL when the gap is zero, by CHECK) and its new snapshot, one-to-one through `(tenant_id, …)` unique keys.
  - `gap = counted - expected` is a CHECK.
  - Logged waste never enters the gap: it is already in the ledger.
- **Waste:** `waste_entries` keeps the quantity and unit as entered (positive), and points one-to-one at its WASTE ledger row, which holds the converted negative delta ([ADR 0003](adr/0003-units-convert-within-dimension.md)).
- **Orders and stages** ([ADR 0009](adr/0009-default-stage-keys.md)):
  - `orders.stage_key` has a composite FK `(tenant_id, stage_key) → order_workflow_stages (tenant_id, key)` with `ON UPDATE CASCADE`, so renaming a stage key carries over to its orders.
  - `order_stage_history` copies keys as plain text, so history never changes.
  - "cancelled" is `canceled_at`, not a stage.
- **Who placed an order:** `placed_by_type` + `placed_by_id`.
  - There is no FK, because the id points at a user (STAFF) or, in Phase 2, a customer.
  - A CHECK ties GUEST to `placed_by_id IS NULL`.
  - Guests track orders by `tracking_token_hash` (unique, [ADR 0008](adr/0008-guest-order-tracking-token.md)).
- **People** ([ADR 0007](adr/0007-request-context-slug-and-demo-users.md)):
  - `users.branch_id` is NULL only for ADMIN (CHECK).
  - `is_demo` marks the users `x-dev-role` selects.
  - `tenants.is_demo` marks the one tenant that accepts writes in Phase 1 (B503).
  - `password_hash` exists for B1001; login is Phase 2.
- **Precision and unit conversion:** Postgres rounds silently when a value has more decimals than the column.
  - Example: 0.5 G entered against a KG item converts to 0.0005, which `numeric(14,3)` would store as 0.001.
  - So B601 and B701 must **reject** a converted quantity with more than 3 decimals instead of storing it. [ADR 0013](adr/0013-numeric-precision.md) records this.
- **Prices of 0 are allowed** (free items): prices, totals and costs are `>= 0` where ROADMAP B301 says "positive". Recorded as deviation D21 in [MODEL-MAPPING.md](MODEL-MAPPING.md).
- **Service-enforced (the database cannot see these):** the `(tenant_id, id)` foreign keys keep every link inside the tenant. They do not check that:
  - a waste entry's ledger row is a WASTE row for the same branch and item
  - a reconciliation's adjustment is an ADJUSTMENT row for the same branch and item
  - a reconciliation's snapshot is for the same branch and item

  B901/B902 write these rows together in one transaction, so the services guarantee it. Recorded as deviation D22 in [MODEL-MAPPING.md](MODEL-MAPPING.md). Widening the FKs to `(tenant_id, branch_id, inventory_item_id, id)` stays possible later.
- **Decided in B801** ([ADR 0021](adr/0021-order-lifecycle.md)):
  - History rows keep only the stage keys (no label copy); a Phase 3 stage editor revisits this.
  - STAFF orders keep `placed_by_id` (the actor), even though the PLACED history row has it too.
- **Reserved for later:** `menu_items.is_combo` is CHECKed to `false` in Phase 1. `role_permissions` and `user_permission_overrides` exist but nothing enforces them.

## Access-path indexes

| Path | Index |
| --- | --- |
| Board: orders by stage | `orders (tenant_id, branch_id, stage_key, created_at)` |
| Polling with `updatedSince` (B802) | `orders (tenant_id, branch_id, updated_at)` |
| Ledger by item, in order | `inventory_transactions (tenant_id, branch_id, inventory_item_id, seq)` |
| Ledger by item and time | `inventory_transactions (tenant_id, branch_id, inventory_item_id, created_at)` |
| Waste and other types by time (reports) | `inventory_transactions (tenant_id, branch_id, type, created_at)` |
| Latest snapshot | `inventory_snapshots (tenant_id, branch_id, inventory_item_id, through_seq)` |
| Public menu for a branch | `menu_items (tenant_id, status, branch_id)` |
| Orders by date (reports) | `orders (tenant_id, branch_id, created_at)` |
| Stage rename / delete FK checks | `orders (tenant_id, stage_key)` |
| Waste per item | `waste_entries (tenant_id, branch_id, inventory_item_id, created_at)` |
| Staff per branch | `users (tenant_id, branch_id)` |

`schema-rules.spec.ts` asserts each of these indexes exists.

## CHECK constraints

Prisma cannot express CHECKs, so they are written by hand at the end of the migration that creates their table (`app_environment` in `init_app_environment`, all others in `b301_schema`). Two tests guard them:

- `src/prisma/check-constraints.spec.ts` (no DB): every CHECK in the committed migrations names real columns and real enum values.
- `test/schema-constraints.e2e-spec.ts` (real Postgres): each CHECK rejects a row that breaks only it, and the database has no CHECK without such a case.

Summary:

- Positive quantities on recipes, components, waste and order lines.
- Non-negative prices, totals and costs.
- Ledger sign rules:
  - PURCHASE adds stock.
  - CONSUMPTION and WASTE remove it.
  - No zero deltas.
  - CONSUMPTION always references an order, and only CONSUMPTION does (so every deduction hits the idempotency key).
- `gap = counted − expected`, and there is an adjustment row exactly when the gap is non-zero.
- Stage key format and positive stage positions.
- Tenant slug format.
- ADMIN-only NULL branch.
- No guest placer id, and every guest order has a tracking token.
- History rows: PLACED has only a to-stage, ADVANCED has both, CANCELED has only a from-stage.
- `line_total = unit_price × quantity`.
- No combos in Phase 1.
- **No** CHECK on `branch_stock.current_stock`, because negative stock is allowed ([ADR 0006](adr/0006-negative-stock-allow-and-flag.md)).

## Migrations

| Migration | Ticket | Creates |
| --- | --- | --- |
| `20261106081446_init_app_environment` | B201 | `app_environment` + single-row CHECK |
| `20261106082320_b301_schema` | B301 | every other table, the composite FKs, indexes, and the CHECKs above; switches `app_environment` timestamps to `timestamptz` |

Replay from zero is proven on every `npm run test:e2e`: its global setup rebuilds `tablz_test` with `prisma migrate reset`, applying all migrations to an empty database before the suites run. A new CHECK goes into the new migration that needs it, created with `--create-only`, and gets a case in `schema-constraints.e2e-spec.ts`. That test fails if a CHECK has no case.
