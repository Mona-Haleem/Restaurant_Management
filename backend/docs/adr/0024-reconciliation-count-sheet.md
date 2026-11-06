# ADR 0024 — Reconciliation as a count sheet

- **Status:** accepted
- **Date:** 2026-11-06
- **Answers:** ADR 0020 consequence (B902 adds ADJUSTMENT + snapshot) · **Tickets:** B902

## Context

ROADMAP B902 says to compare a physical count with expected stock (latest snapshot + rows since), flag only the unexplained difference, and write the entry, an ADJUSTMENT row and a new snapshot in one transaction. The PRD describes an end-of-day count by the manager. Several things were still open:

- whether one request counts one item or many;
- who may count;
- what happens when the cached `current_stock` disagrees with the ledger;
- how the snapshot's `through_seq` stays correct while other writers run (SCHEMA.md contract).

## Options considered

1. **One item per request.** Simple, but an end-of-day sheet of 30 items becomes 30 transactions, and a failure halfway leaves the sheet partly applied.
2. **A count sheet per request, all or nothing.** One transaction for the whole sheet. Items are locked in id order, the same order `apply` uses, so there are no deadlocks.

## Decision

- **Count sheet:** `POST /v1/:tenantSlug/reconciliations` takes `{ counts: [{ inventoryItemId, quantity, unit }], note? }` (1–200 lines, each item once: `DUPLICATE_COUNT`). The whole sheet is written in one transaction. Branch and actor come from the request context.
- **Who:** MANAGER and ADMIN. ARCHITECTURE §3 gives workers orders and waste only.
- **Units:** any unit of the item's dimension, converted like waste (ADR 0003). A count may be zero.
- **`LedgerService.reconcile`** does the stock work. `ReconciliationService` only adds the entries. For each item, in id order:
  1. Lock the `branch_stock` row with an UPDATE.
  2. Under that lock, read expected stock: the latest snapshot plus Σ rows with `seq > through_seq`, or all rows if the item was never counted.
  3. Compute `gap = counted − expected` with the pure `reconcileCount`.
  4. For a non-zero gap, write the ADJUSTMENT row through `apply`.
  5. Snapshot the count with `through_seq = max(seq)`, read while the lock is still held.
- **Cache mismatch:** if `current_stock` ≠ expected under the lock, the count is refused as a logged 500 (`StockCacheMismatchError`). That is a broken invariant (rule 3), not a stock gap, and hiding it in an ADJUSTMENT would leave `current_stock` ≠ the count.
- **Size check (B901 follow-up):** `toStockQuantity` now also refuses amounts that do not fit `numeric(14,3)` after conversion: `QUANTITY_TOO_LARGE`, for waste, restock and counts.

## Consequences

- Logged waste is already a WASTE row, so it is never part of the gap. This is a required suite in `test/reconciliation.e2e-spec.ts`, with a pure test in `reconciliation-math.spec.ts`.
- **Later stock views:** after a count, every expected-stock calculation, including B702's stock view, starts from the new snapshot.
- **Tests that count whole tables:** `seed.e2e-spec.ts` checks only the seed's own reconciliation entries, because this suite counts on the demo tenant too.
- **Not built:** a list or read route for reconciliations. B1101 reads the entries from the database; add a `GET` when a screen needs one.
- **Blind counts:** the API does not show the expected value before the count. Whether the UI shows it is a frontend decision.
