# ADR 0014 — Workflow stages as a table, not JSON

- **Status:** accepted
- **Date:** 2026-11-06
- **Answers:** ROADMAP B302 requirement · **Tickets:** B301, B302, B401, B801, B802

## Context

PRD §7.3 describes `OrderWorkflowConfig` as one object per tenant with a `stages` list, each stage `{ key, label, cancellable, deductsInventory }`. Order logic reads only the flags and the position of the current stage. Phase 3 lets an admin rename, add, remove and reorder stages. B301 had to store this config.

## Options considered

1. **JSON column** (e.g. `tenants.workflow_config jsonb`) — matches the PRD shape one to one, one read per tenant. But orders cannot have a foreign key to a stage, a rename has to rewrite `orders.stage_key` by hand, uniqueness of keys and positions is not enforced, and Prisma types the column as untyped JSON.
2. **Table `order_workflow_stages`**, one row per stage per tenant — orders reference a stage through a composite FK (history rows copy the key as plain text, see SCHEMA.md "Open for B801"), the database enforces unique keys and positions, and every flag is a typed column.

## Decision

Option 2. `order_workflow_stages (tenant_id, key, label, position, cancellable, deducts_inventory)` with unique `(tenant_id, key)` and `(tenant_id, position)`. `orders.stage_key` references `(tenant_id, key)` with `ON UPDATE CASCADE`, so a rename carries over to existing orders. The API rebuilds the PRD shape: `{ stages: [...] }` sorted by `position`.

## Consequences

- Four default rows are seeded per tenant (B401, keys from ADR 0009).
- Code finds the next stage by position and reads the flags from the row; no code compares a key or label (CLAUDE.md rule 2; B801 tests a reordered and renamed fixture).
- Reordering in Phase 3 must swap positions inside one transaction (the unique position constraint is not deferrable today; make it `DEFERRABLE` or move through a temporary position when the editor is built).
- Removing a stage that orders still use is blocked by the FK (`Restrict`), which is the safe default; the Phase 3 editor must move or finish those orders first.
- `cancelled` is not a row; it is derived from `orders.canceled_at` (ADR 0009).
