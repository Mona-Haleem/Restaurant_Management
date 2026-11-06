# ADR 0021 — Stock view, restock and menu availability

- **Status:** accepted
- **Date:** 2026-11-06
- **Answers:** ADR 0005 open point (is the restock cost required?), ADR 0019 deferral (menu availability) · **Tickets:** B702, B901, B902, B1101

## Context

B702 adds the expected-stock query, the low-stock list and restock as a PURCHASE. ADRs 0002, 0003, 0005, 0006 and 0020 fix the arithmetic and the single writer. Still open: whether a restock must carry a cost, which status values the stock view returns (the Angular app already has `INVENTORY_STATUS`), when a customer menu item counts as unavailable (deferred by ADR 0019), and who may see and change stock.

## Decision

- **Restock = `LedgerService.recordPurchase`**, through the same write path as deductions (ADR 0020). Quantity and cost are entered per input unit (default: the stock unit) and converted to the stock unit (ADR 0003); values that need more than numeric(14,3) / numeric(14,4) after conversion are refused, never rounded (ADR 0013). MIXED items are refused (ADR 0002).
- **The unit cost is optional.** With a cost, the row stores it and the moving average is re-weighted from the stock before the purchase (ADR 0005). Without one, the row stores the current average (else the standard cost) and the average is unchanged. A cost of 0 is allowed (free samples, a supplier's replacement) and pulls the average down accordingly.
- **Statuses** match the Angular app, plus a negative flag (ADR 0006): `negative` (< 0), `out-of-stock` (= 0), `low-stock` (< threshold), `in-stock`, `derived` (MIXED). `critical` is not returned: there is no critical threshold column. The low-stock list returns the first three, worst first.
- **Expected stock** per item = latest snapshot + Σ `quantity_delta` with `seq > through_seq` (or the sum of all rows when never counted), returned beside the cached `current_stock` (they must agree), with the last count's date and quantity on the detail route.
- **MIXED derived stock** = min(component stock ÷ quantity per unit), truncated to 3 decimals, never below 0, with the limiting component. Read-only.
- **Customer menu availability:** an item is `available: false` when any RAW/READY item one serving needs (sauces expanded) has less stock in the caller's branch than one serving uses. It stays listed (shown greyed out) and ordering is not blocked in Phase 1 (ADR 0006). Without a branch (a multi-branch tenant's guest) every item shows as available.
- **Access:** ADMIN and MANAGER view and restock; WORKER and guests are refused. Stock is per branch: the caller's, `x-dev-branch` for ADMIN, else `400 BRANCH_REQUIRED`.

## Consequences

- Routes: `GET /:tenantSlug/stock`, `GET /:tenantSlug/stock/low`, `GET /:tenantSlug/stock/:inventoryItemId`, `POST /:tenantSlug/stock/:inventoryItemId/restock`. The catalog module now imports the inventory module for availability.
- `single-writer.spec.ts` now treats any Prisma write call on `branchStock`, a nested write through a stock relation, an atomic operator on `currentStock`, or raw SQL on `current_stock` as a write; reads and response fields named `currentStock` no longer trip it. Allowed writers: `LedgerService` and the seed writer.
- B1101's waste-cost KPI may meet PURCHASE rows whose cost came from the average rather than an invoice; that is expected.
- The stock reads of one response are separate statements: a write landing between them can show `expectedStock` and `currentStock` apart for that one response.
- Performance follow-up: expected stock runs one sum query per counted item. Once B902 writes snapshots for most items, replace it with one grouped query.
- Still missing: an API to create inventory items and edit their thresholds (no ticket yet).
