# ADR 0022 — Order lifecycle: placer, branch scope, concurrency, history

- **Status:** accepted
- **Date:** 2026-11-06
- **Answers:** SCHEMA.md "Open for B801" · **Tickets:** B801, B802, B1101

## Context

B801 builds placing, advancing and cancelling orders on the tenant's workflow (ARCHITECTURE §6, ADRs 0008, 0009, 0014, 0020). The roadmap says Phase 1 orders are GUEST, but WORKERs may also place orders (ARCHITECTURE §3). SCHEMA.md left two points open: whether history rows copy the stage label, and whether STAFF orders keep `placed_by_id`. Nothing said how two concurrent changes of one order are resolved, or which branch's orders a staff member may move.

## Options considered

1. **Placer:** always GUEST (staff orders get a token nobody keeps), or STAFF + actor for a staff caller and GUEST + token for a guest.
2. **Concurrency:** lock the order row (`SELECT … FOR UPDATE`) and re-read, or a compare-and-set update on the stage the caller read.
3. **History:** copy the label as well (new migration), or keys only.

## Decision

Confirmed with the product owner on 2026-11-06:

- **Placer:** a staff caller places a `STAFF` order with `placed_by_id` = the actor and no tracking token; a guest places a `GUEST` order with a token (ADR 0008). `placed_by_id` stays for STAFF (no join needed for reports).
- **Branch scope:** WORKER and MANAGER advance and cancel only orders of their own branch; others are 404 `ORDER_NOT_FOUND`. ADMIN acts on any branch of the tenant. Placing needs a branch in the context (`400 BRANCH_REQUIRED` otherwise: a guest or an ADMIN without `x-dev-branch` in a multi-branch tenant).
- **Concurrency:** every stage change is `UPDATE orders … WHERE id = $id AND stage_key = <read> AND canceled_at IS NULL`. Postgres re-checks the condition after waiting on a concurrent change, so only one of two racing changes applies; the other gets `409 ORDER_STAGE_CHANGED`. The ledger's own order lock (ADR 0020) runs inside the same transaction.
- **Deduction:** the next stage by position is found by `planAdvance` (flags and positions only). If it is `deducts_inventory`, `LedgerService.deductOrder` runs in the same transaction. A later stage that also deducts is a quiet no-op thanks to the ledger's idempotency.
- **History:** keys only, no migration. Stage renames are a Phase 3 feature; the editor decides there whether to copy labels.
- **Routes:** `GET /workflow` (guests too), `POST /orders` (guests too), `POST /orders/:id/advance` and `/cancel` (WORKER and up), `POST /track/:token/cancel` (guest). The guest `GET /track/:token` belongs to B802 with the other queries.
- **Order lines:** 1–50 lines, quantity 1–99; repeated menu items stay separate lines (not merged). Line order is not stored: lines share one `created_at`, so reads order them by id (see Consequences). Name and price come from the menu, never from the client. Only ACTIVE items in active categories sold in the order's branch are accepted (`400 MENU_ITEM_UNAVAILABLE` lists the rest).
- **Logs:** the request logger redacts the `/track/:token` segment and drops the route params of tracking requests (ADR 0008's consequence, not built in B501).

## Consequences

- Error codes for the frontend: `ORDER_NOT_FOUND`, `ORDER_AT_LAST_STAGE`, `ORDER_CANCELED`, `ORDER_NOT_CANCELLABLE`, `ORDER_STAGE_CHANGED`, `MENU_ITEM_UNAVAILABLE`, `BRANCH_REQUIRED`, `ORDER_TOTAL_TOO_LARGE`.
- A double click on "advance" moves an order only one stage when the two requests overlap, but two sequential clicks move it two stages. If the board needs exact intent, add an optional `fromStageKey` to the advance body later.
- **The first stage must not deduct.** Placing an order never calls the ledger (a guest has no actor for the ledger row), so a workflow whose lowest-position stage is flagged `deducts_inventory` would skip the deduction. The defaults never do this; the Phase 3 stage editor must reject such a config.
- **Line order:** if the order detail (B802) must show lines in the cart's order, add an `order_items.position` column in that ticket.
- The tracking token path parameter is validated (43 base64url characters); a malformed token is a 404 `ORDER_NOT_FOUND`, like an unknown one.
- Phase 2 customer accounts place `CUSTOMER` orders through the same path; offline replay will need an idempotency key on order creation (not built).
- B1101 reports can read `placed_by_type` to split guest and staff orders.
