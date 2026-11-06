# ADR 0009 — Default workflow stage keys follow the Angular app

- **Status:** accepted
- **Date:** 2026-11-06
- **Answers:** ARCHITECTURE §10 Q9 · **Tickets:** B301, B401, B502, B801, B802, B1301

## Context

The seed, the frontend mocks and the contract tests must agree on the four default stage keys. The PRD spells them two ways: §7.3 `pending / preparing / ready / completed`, §4 `PENDING → IN_PREPARATION → READY → DELIVERED`. The Angular app already defines `ORDER_STAGES` in `frontend/src/app/shared/constants/constants.ts` as `pending | in-preparation | ready | delivered` (plus `cancelled`), and its status badge config maps the PRD spellings onto these as aliases. Order behavior never reads a key (ARCHITECTURE §6), so this is a contract decision only.

## Options considered

1. **Frontend keys** `pending`, `in-preparation`, `ready`, `delivered` — no frontend change.
2. **PRD §7.3 keys** — frontend constants and mocks would need to change.
3. **PRD §4 keys** (upper snake case) — same, plus a style change.

## Decision

Option 1. Default stages seeded per tenant (flags from PRD §7.3):

| position | key | label | cancellable | deducts_inventory |
| --- | --- | --- | --- | --- |
| 1 | `pending` | Pending | true | false |
| 2 | `in-preparation` | In Preparation | false | false |
| 3 | `ready` | Ready | false | false |
| 4 | `delivered` | Delivered | false | true |

`cancelled` is not a stage. Cancelling sets `orders.canceled_at`; the API exposes it as a derived `status: "cancelled"` alongside `stageKey`.

## Consequences

- **Schema (B301):** `order_workflow_stages.key` CHECK `key ~ '^[a-z][a-z0-9-]*$'`; unique `(tenant_id, key)` and `(tenant_id, position)`.
- **Seed (B401):** inserts the table above, idempotently, per tenant.
- **OpenAPI (B502):** `stageKey` is a string (tenant data), not an enum, because tenants may rename or add stages later; the defaults are listed in the description.
- **Tests (B801):** the workflow fixture still uses renamed and reordered stages to prove no code reads keys.
- **Docs:** the PRD's spellings are superseded by this table.
