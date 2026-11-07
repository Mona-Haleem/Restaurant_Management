# ADR 0024 — Order polling (ETag) and the board's order set

- **Status:** accepted
- **Date:** 2026-11-06
- **Answers:** ARCHITECTURE §6 ("updatedSince or ETag") · **Tickets:** B802, B1301

## Context

B802 adds the order queries the Angular board, order detail and guest tracking poll (PRD §8.1, §8.2). The roadmap asks for "an `updatedSince` or ETag mechanism so frontend polling stays cheap": an unchanged poll must return a cheap not-modified response, and a status change must appear in the next poll. It also had to decide which orders the board lists by default, and what a guest sees.

## Options considered

1. **ETag** from a cheap fingerprint of the result; 304 when unchanged; the client replaces what it shows.
2. **`updatedSince`**: return only orders changed since a timestamp; the client merges, and must handle orders that leave the board (cancelled, finished).
3. **Both.**

## Decision

Option 1, confirmed with the product owner.

- **Routes:** `GET /:tenantSlug/orders` (`listOrders`), `GET /:tenantSlug/orders/:id` (`getOrder`) for WORKER, MANAGER and ADMIN; `GET /:tenantSlug/track/:token` (`getTrackedOrder`) for guests.
- **ETag** (weak, `W/"…"`): a hash of the request's scope (tenant, branch, filters) plus, for the list, how the matching orders split over stages (count per stage, from one `GROUP BY`), how many of them are cancelled (`scope=all` only), their latest `updated_at`, and the workflow stages; for one order, its `updated_at` (every transition updates the order row, ADR 0022). If `If-None-Match` matches (weak comparison, lists and `*` supported), the answer is **304 with no body and no order rows read**. Every answer carries `Cache-Control: private, no-cache`.
- **Board set:** `scope=active` (default) = not cancelled and not yet in the last stage **by position** (never a key, rule 2), oldest first, not capped. `scope=all` = every order, newest first, at most 200. `?stageKey` filters to one stage.
- **Branches** (ADR 0022): WORKER and MANAGER see their own branch only (`403 BRANCH_FORBIDDEN` for another `branchId`; another branch's order is `404`); ADMIN sees every branch or one (`?branchId`).
- **Detail:** the order, its items (ordered by id) and its stage history (oldest first).
- **Tracking:** stage, status, items, total, note, timestamps and the workflow's stages (for the stepper). No order id, placer, branch or history. An unknown or malformed token is `404 ORDER_NOT_FOUND`.

## Consequences

- The Angular client stores the last ETag per query and sends it as `If-None-Match`; on 304 it keeps what it shows.
- Why the per-stage split: `updated_at` is set when a statement runs, not when its transaction commits. A move that commits after a newer change would leave count and latest `updated_at` unchanged; it always changes the per-stage counts (or the cancelled count), so the tag changes whatever the commit order. Remaining blind spot: two orders swapping stages at the same moment (counts unchanged, timestamps not newer). Acceptable for a board polled every few seconds; revisit (e.g. a per-tenant change counter) if it is ever seen.
- The detail and tracking tags rely on one row's `updated_at`; updates to one row are serialized, so it only moves forward.
- Line items do not keep the cart's order (no `order_items.position`, no migration in B802, ADR 0022); add the column in its own ticket if the detail must show cart order.
- `scope=active` is not paginated: a branch with hundreds of unfinished orders returns them all.
- Polls count toward the per-IP rate limit (ADR 0018); 120 per minute covers one board polling every few seconds.
