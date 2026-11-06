# ADR 0020 — Ledger service contract

- **Status:** accepted
- **Date:** 2026-11-06
- **Answers:** ADR 0016 consequence (seed shares the ledger's functions) · **Tickets:** B701, B702, B801, B901, B902

## Context

B701 builds the single writer of `branch_stock.current_stock` (CLAUDE.md rule 3). ARCHITECTURE §5, SCHEMA.md and ADRs 0002, 0005, 0006 and 0013 fix the arithmetic and the write order, but not how callers use the service, what a repeated delivery does, or how concurrent writers stay deadlock-free.

## Decision

- **`LedgerService` in `src/modules/inventory`** has no HTTP routes. Every method takes the caller's transaction (`LedgerTx`), so stock changes commit or roll back with the caller's own writes (an order's stage change in B801, a waste entry in B901).
- **`deductOrder(tx, { orderId, actorId })`** writes CONSUMPTION rows for an order:
  1. Locks the order row (an `UPDATE` of `updated_at`), so a concurrent or repeated delivery waits.
  2. If CONSUMPTION rows for the order already exist, returns `{ alreadyDeducted: true }` and writes nothing: a **quiet no-op**, safe for retries and Phase 2 offline replay. The unique key `(related_order_id, inventory_item_id, type)` stays as the database backstop.
  3. Expands the order with `expandOrder` (recipe lines, then MIXED one level into components, converted to stock units, aggregated per item), using the recipes as they are at delivery time.
- **`recordWaste(tx, { branchId, inventoryItemId, quantity, unit, actorId, reason })`** writes one WASTE row and returns its id. MIXED items are refused (`MIXED_ITEM_NOT_STOCKED`, ADR 0002).
- **Write order and locks**, shared by both: per item in **ascending id order** (a fixed lock order, so two transactions never deadlock), insert the missing `branch_stock` row (`ON CONFLICT DO NOTHING`), then `current_stock = current_stock + delta` (which locks the row until commit), and only then insert the ledger rows (SCHEMA.md contract). Stock may go negative; the result lists those items (ADR 0006).
- **Cost on each row:** the branch's moving average, else the item's `standard_unit_cost`, else NULL (ADR 0005).
- **Refused amounts:** a quantity that is not positive, in the wrong dimension, or that needs more than 3 decimals in the stock unit (ADR 0013), with stable codes (`QUANTITY_NOT_POSITIVE`, `UNIT_DIMENSION_MISMATCH`, `QUANTITY_TOO_PRECISE`, `MIXED_COMPONENT_IS_MIXED`).
- **Pure functions** (`ledger-math.ts`): `expandOrder`, `nextAverageCost`, `expectedStock`. The demo seed uses `expandOrder` and `nextAverageCost` too, so seeded history and live writes follow the same rules (ADR 0016 stays the one exception for *writing*).

## Consequences

- B801 calls `deductOrder` inside the transaction that moves the order into a `deducts_inventory` stage; B801 decides whether the stage requires it (flags, rule 2). B901 creates the waste entry and links it to `recordWaste`'s transaction id.
- B702 adds PURCHASE (with `nextAverageCost`) and B902 adds ADJUSTMENT plus the snapshot to the same service and **must go through the same `apply` path** (same lock order); B902 must read `max(seq)` while holding the stock row lock (SCHEMA.md), with its own concurrency test.
- `src/modules/inventory/single-writer.spec.ts` fails when any other file assigns `currentStock`.
- Locking the order row bumps its `updated_at`, which board polling (B802) sees as a change. The delivery changes the order anyway.
