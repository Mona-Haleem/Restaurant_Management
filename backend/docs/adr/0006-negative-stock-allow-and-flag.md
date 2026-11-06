# ADR 0006 — Negative stock: allow and flag

- **Status:** accepted
- **Date:** 2026-11-06
- **Answers:** ARCHITECTURE §10 Q6 · **Tickets:** B301, B302, B701, B702, B901, B902, B1101

## Context

An order reaching a `deducts_inventory` stage may need more of an item than the cached stock shows — because counts drifted, a restock was not entered, or waste went unlogged. By then the food is usually made. B302 requires a negative-stock ADR; this is it. B701 must prove `stock = snapshot + transactions since`.

## Options considered

1. **Block** — reject with `INSUFFICIENT_STOCK`. Stops a real kitchen mid-service over a data problem, and invites fake restocks.
2. **Allow and flag** — deduct anyway; stock goes negative; surface it.
3. **Clamp at zero** — drop the remainder. Breaks the ledger invariant and hides the loss.
4. **Block at placement, allow at delivery** — needs stock reservation; Phase 2.

## Decision

Option 2. Deductions from orders (CONSUMPTION) and waste (WASTE) are never refused for lack of stock. `branch_stock.current_stock` may go below zero, and the ledger still records the full quantity.

## Consequences

- **Schema (B301):** no `CHECK (current_stock >= 0)` on `branch_stock`. Quantities on input rows stay positive (`waste_entries.quantity > 0`, restock quantity > 0, reconciliation `counted_quantity >= 0`).
- **Ledger (B701):** the deduction result reports which items ended below zero, so callers and logs can surface it; the order transition itself succeeds.
- **Stock queries (B702):** items with `current_stock < 0` are flagged `NEGATIVE` (distinct from `LOW`) in the stock view.
- **Reconciliation (B902):** a physical count resets stock through an ADJUSTMENT row as usual; negative stock is the main thing reconciliation exists to fix.
- **KPIs (B1101):** a `NEGATIVE_STOCK` anomaly per (branch, item) while negative, from a pure detection function.
- **Cost ([ADR 0005](0005-cost-basis-moving-average.md)):** a purchase into zero or negative stock resets the moving average to the purchase cost.
- **Tests:** a deduction past zero succeeds and leaves `current_stock` equal to snapshot + Σ deltas (negative); the randomized ledger test includes sequences that cross zero.
- **Later:** option 4 (availability check at order placement) can be added on top without changing this rule.
