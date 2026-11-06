# ADR 0013 — Numeric precision and decimals on the wire

- **Status:** accepted
- **Date:** 2026-11-06
- **Answers:** ARCHITECTURE §7 (decimals as strings, proposed default) · **Tickets:** B301, B302, B502, B601, B701, B702, B801, B901, B902, B1101

## Context

Money, stock and cost must be exact (CLAUDE.md rule 4). B301 already chose column types. Two things were left open:

- what happens when a value has more decimals than its column. Postgres rounds silently, so 0.5 G entered against a KG item (0.0005 KG) would be stored as 0.001 KG;
- how decimals travel in JSON. A JSON number becomes a JavaScript float in Angular, and a float cannot hold 0.1 exactly.

## Options considered

1. **Floats everywhere** — simple; loses cents and grams over many rows. Ruled out by rule 4.
2. **Integers in minor units** (piastres, milligrams) — exact, but every unit needs its own scale, and the ledger mixes units.
3. **`numeric` with a fixed scale per kind of value, sent as strings** — exact in the database and on the wire; the frontend needs a decimal library for any math.
4. **`numeric` in the database, numbers in JSON** — exact on the server, rounded in the browser.

## Decision

Option 3.

| Kind | Column type | Examples |
| --- | --- | --- |
| Money | `numeric(12,2)` | `menu_items.price`, `orders.total`, `order_items.unit_price`, `order_items.line_total` |
| Stock quantity | `numeric(14,3)` (0.001 of a unit = 1 g on a KG item) | `branch_stock.current_stock`, `quantity_delta`, recipe and component quantities, snapshots, waste, reconciliation |
| Unit cost | `numeric(14,4)` | `unit_cost`, `avg_unit_cost`, `standard_unit_cost` |

- **Inputs are never rounded.** A value (after unit conversion, ADR 0003) with more decimals than its column's scale is rejected with a validation error. It is never stored rounded.
- **Exact derived values stay exact.** `line_total = unit_price × quantity` (integer quantity) and `total = Σ line_total` need no rounding.
- **Only a division rounds.** The weighted moving average (ADR 0005) is computed with `Decimal` at full precision and then rounded **half-up** to 4 decimals, once, when it is stored. (Default chosen in B302; change it here if accounting needs another mode.)
- **Code** uses Prisma `Decimal` (decimal.js) for every operation on these values, including tests. No `number`, no `parseFloat`.
- **Wire format:** every `numeric` column is serialized as a JSON string with its column's scale (`"12.50"`, `"0.150"`). `bigint` columns (`seq`, `through_seq`) are strings too. Order item `quantity` is an integer and stays a JSON number. In the OpenAPI spec these fields are `type: string` with a decimal `pattern` (B502 follow-up).

## Consequences

- `src/prisma/schema-rules.spec.ts` already pins the three precisions and bans `Float`.
- B601, B701, B702, B901 and B902 validate the scale of every decimal input and test the rejection. B701 converts units before checking scale.
- The ADR 0005 averaging function gets a rounding test.
- B502/B503 add a serializer for `Decimal` and `bigint` (a DTO transform or an interceptor) and mark the fields as strings in `openapi.json`.
- TABLZ-401 types these fields as `string` in the Angular models (MODEL-MAPPING.md D16); any frontend math uses a decimal library.
- Larger values (more than 9,999,999,999.99 in one money field) need a migration. Unlikely for one restaurant; revisit if a tenant reports in a currency with very large amounts.
