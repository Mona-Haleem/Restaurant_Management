# ADR 0002 — MIXED items have derived stock in Phase 1

- **Status:** accepted
- **Date:** 2026-11-06
- **Answers:** ARCHITECTURE §10 Q3 · **Tickets:** B301, B701, B702, B902

## Context

A MIXED item is prepared in-house from other inventory items (e.g. a sauce reused across recipes). The sources disagree:

- PRD §4 (inventory line): preparing it deducts raw stock and adds to the prepared item's own stock — i.e. it is stocked.
- PRD §14.2 (inventory screen): its row expands to a raw-ingredient breakdown "since its stock is derived rather than directly stocked".
- ROADMAP B701: deducting a MIXED item cascades to its raw components.

The transaction enum (PURCHASE | CONSUMPTION | WASTE | TRANSFER | ADJUSTMENT) has no production type, so the stocked model is not supported by the current ticket set.

## Options considered

1. **Derived only** — MIXED never holds stock; sales deduct its components. Simple; batch prep can never be modelled.
2. **Stocked with batch production** — MIXED holds stock; a new PRODUCTION transaction moves stock from components to the item. Realistic, but adds an enum value, an endpoint and reconciliation rules that no Phase 1 ticket covers.
3. **Derived now, stocked later** — option 1 for Phase 1, with the schema shaped so option 2 is an additive change later.

## Decision

Option 3. In Phase 1 a MIXED item has no stock of its own. When an order reaches a `deducts_inventory` stage, each MIXED ingredient is expanded through `inventory_item_components` into its components, quantities are aggregated per inventory item (ARCHITECTURE §5), and only those items get CONSUMPTION rows.

## Consequences

- **Schema (B301):** a MIXED item never has a `branch_stock` row (stock lives in `branch_stock` per [ADR 0004](0004-tenant-definitions-branch-stock.md)); enforced by the ledger service and the seed, since a CHECK cannot look at another table. `inventory_item_components` stores, per one unit of the MIXED item, the quantity of each component.
- **One level only:** components must be RAW or READY, not another MIXED item. This keeps the cascade non-recursive and cycle-free. Enforced in the service (B601/B701) because a CHECK cannot look at another row. *Revisit if a recipe needs a sauce made from another sauce.*
- **Ledger (B701):** no `inventory_transactions` row ever references a MIXED item. The ledger service rejects writes for MIXED items with a stable error code.
- **Waste (B901), restock (B702), reconciliation (B902):** MIXED items cannot be restocked, wasted or counted directly in Phase 1. Wasted sauce is logged as waste of its components.
- **Stock queries (B702):** a MIXED item's "available" figure is derived as `min(component stock / quantity per unit)` and is read-only.
- **Later (Phase 2):** batch production = add `PRODUCTION` to the enum, allow `branch_stock` rows for MIXED items, add a "prepare batch" endpoint, and switch the cascade to deduct the MIXED item when it has stock. All additive; no data rewrite.
