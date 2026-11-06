# ADR 0010 — Ledger compaction deferred; archive-only rule fixed now

- **Status:** accepted
- **Date:** 2026-11-06
- **Answers:** ARCHITECTURE §10 Q8 · **Tickets:** B1401 (check), future Phase 2 ticket

## Context

PRD §7.4 mentions compacting old ledger rows; no Phase 1 roadmap ticket does it. A Phase 1 demo tenant produces a modest number of `inventory_transactions` rows, and snapshots (B902) already bound the "expected stock" query. CLAUDE.md rule 5 forbids hard deletes of business data, and the unique key `(related_order_id, inventory_item_id, type)` is what makes order deductions idempotent (ARCHITECTURE §5). Deleting CONSUMPTION rows would let a replayed order deduct again.

## Options considered

1. **Defer to Phase 2** — no work, no rule.
2. **Add a ticket now** — snapshot-and-archive job in Phase 1. Extra scope; risks the idempotency guarantee.
3. **Defer, but write the rule down now** — no work now; any later compaction has fixed constraints.

## Decision

Option 3. No compaction in Phase 1. Any future compaction must:

1. Write a snapshot per (branch, item) at the cut-off first, in the same transaction.
2. **Move** rows older than the cut-off to an archive table (e.g. `inventory_transactions_archive`) — never delete them.
3. Keep order idempotency: either the unique key spans live and archived rows, or a compact `order_deductions (tenant_id, order_id)` marker table is written by B701 so a replay is refused without the old rows.
4. Never compact past the latest reconciliation snapshot that reports still reference.

## Consequences

- Phase 1 keeps every ledger row in `inventory_transactions`.
- **B1401:** checks table size against the Supabase plan limit and records the number; this ADR is the rule set if compaction becomes necessary.
- **Phase 2:** a compaction ticket, built against the four rules above.
