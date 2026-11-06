# ADR 0004 — Tenant-wide definitions, per-branch stock

- **Status:** accepted
- **Date:** 2026-11-06
- **Answers:** ARCHITECTURE §10 Q5 · **Tickets:** B301, B401, B601, B701, B702, B801, B901, B902, B1101

## Context

PRD §4 says the manager builds the menu and registers inventory *per branch*, and the PRD's `InventoryTransaction` carries `branchId`. PRD §4 also allows "single or multiple inventories per branch", and the Phase 3 archetypes include both a chain where each branch has its own menu and setups with a shared menu. ROADMAP §4 shows no `branch_id` on `menu_items` or `inventory_items`. Phase 1 UI shows a single restaurant, so one branch is seeded either way. Adding a branch dimension later would mean backfilling an append-only ledger, orders and stock.

## Options considered

1. **Per tenant only** — as the roadmap tables show. Simplest; the costliest retrofit later.
2. **Everything per branch** — `branch_id NOT NULL` on `menu_items` and `inventory_items`. Literal PRD reading; duplicated definitions across a chain.
3. **Tenant-wide definitions, per-branch stock** — item and dish definitions per tenant; stock and availability per branch.

## Decision

Option 3.

- `inventory_items` (name, type, stock unit) and `menu_items` / `categories` / `menu_item_ingredients` / `inventory_item_components` are tenant-wide.
- New table `branch_stock (tenant_id, branch_id, inventory_item_id, current_stock, low_stock_threshold)`, unique on `(tenant_id, branch_id, inventory_item_id)`. This is where the cached `current_stock` lives.
- `menu_items.branch_id` is nullable: `NULL` = offered at every branch; a value = that branch only.
- `orders`, `inventory_transactions`, `inventory_snapshots`, `waste_entries` and `reconciliation_entries` carry `branch_id NOT NULL`.

## Consequences

- **Schema (B301):** composite FKs `(tenant_id, branch_id) → branches(tenant_id, id)` everywhere a branch is referenced. For nullable `menu_items.branch_id`, Postgres `MATCH SIMPLE` skips the check when it is NULL, which is what we want. Indexes lead with `(tenant_id, branch_id, …)` for stock, ledger and order access paths.
- **Ledger (B701):** the single writer updates `branch_stock`, keyed by `(branch, item)`. The idempotency key `(related_order_id, inventory_item_id, type)` is unchanged, because an order belongs to exactly one branch.
- **Expected stock and snapshots (B701, B902):** computed per `(branch, item)`.
- **MIXED items ([ADR 0002](0002-mixed-items-derived-stock.md)):** they never get `branch_stock` rows (replaces the nullable-`current_stock` CHECK in that ADR).
- **Catalog (B601):** the public menu for a branch = items where `branch_id IS NULL OR branch_id = :branch`. Per-branch price overrides are not in Phase 1.
- **Context (B503 / Q2):** every write needs a branch; Q2 must say where `branchId` comes from.
- **Seed (B401):** one tenant, one branch, `branch_stock` rows for every non-MIXED item.
- **Roles:** "MANAGER → everything within their branch" (ARCHITECTURE §3) maps onto `branch_id` filters; tenant-wide definitions (items, dishes) are ADMIN or MANAGER — confirm in B503/B1001.
- **Later:** "multiple inventories per branch" = add `inventory_locations` and move the stock key from branch to location. Per-branch prices = a `branch_menu_prices` override table.
