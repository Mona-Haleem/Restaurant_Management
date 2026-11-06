# ADR 0005 — Cost basis: weighted moving average with a standard-cost fallback

- **Status:** accepted
- **Date:** 2026-11-06
- **Answers:** ARCHITECTURE §10 Q10 · **Tickets:** B301, B701, B702, B901, B902, B1101

## Context

B1101 must report waste cost, but ROADMAP §4 gives `inventory_items` no cost column. The restock form (PRD) asks for a cost. Historical figures (yesterday's waste cost) must not change when a supplier raises prices, and the ledger is append-only.

## Options considered

1. **Cost on the item** — one editable `unit_cost`. Trivial; past waste is revalued whenever it changes.
2. **Cost on each PURCHASE row, weighted moving average** — exact enough, history frozen; no cost for stock that never came through a restock.
3. **Option 2 plus a manual standard cost on the item** — covers opening/seeded stock.
4. **FIFO lots** — exact, but needs lot tracking. Out of Phase 1 scope.

## Decision

Option 3.

- `inventory_items.standard_unit_cost` (nullable `Decimal`, per stock unit): manual fallback.
- `branch_stock.avg_unit_cost` (nullable `Decimal`, per stock unit): maintained only by the ledger service.
- Every `inventory_transactions` row stores `unit_cost` (nullable `Decimal`) as it was at write time.

Rules, all inside the ledger transaction (single writer, ARCHITECTURE §5):

- **PURCHASE** with cost `c` and quantity `q`: if current stock `s > 0` and an average `a` exists, new average = `(s·a + q·c) / (s + q)`; otherwise new average = `c`. The row stores `c`.
- **CONSUMPTION, WASTE, ADJUSTMENT, TRANSFER**: the row stores the current `avg_unit_cost`, else the item's `standard_unit_cost`, else NULL. The average does not change.
- Costs entered in another unit of the same dimension are converted to cost per stock unit ([ADR 0003](0003-units-convert-within-dimension.md)).

## Consequences

- **Schema (B301):** the three columns above; CHECK `unit_cost >= 0` and `standard_unit_cost >= 0`. Precision is fixed by [ADR 0013](0013-numeric-precision.md): costs are `numeric(14,4)`, and the average is rounded half-up to 4 decimals when stored.
- **Restock (B702):** `unit_cost` is required on restock (decide in B702 whether it can be omitted; if omitted, the average is unchanged).
- **KPIs (B1101):** waste cost = Σ |`quantity_delta`| × `unit_cost` over WASTE rows; rows with NULL cost are counted and reported as "uncosted", never treated as zero.
- **MIXED items:** a sale writes rows for the components, so cost comes from them; no cost on the MIXED item itself ([ADR 0002](0002-mixed-items-derived-stock.md)).
- **Pure functions + tests:** the averaging step is a pure `Decimal` function with unit tests (zero stock, negative stock, first purchase, rounding).
- **Interacts with Q6 (negative stock):** when stock is ≤ 0 the next purchase resets the average to its own cost.
- **Later:** FIFO lots would add a `stock_lots` table fed by PURCHASE rows; the per-row `unit_cost` keeps history valid through such a change.
