# ADR 0003 — Units: fixed enum, conversion only within a dimension

- **Status:** accepted
- **Date:** 2026-11-06
- **Answers:** ARCHITECTURE §10 Q4 · **Tickets:** B301, B601, B701, B702, B901, B902

## Context

`menu_item_ingredients` and `inventory_items` each carry a unit (ROADMAP §4). If a recipe says "150 g" and the item is stocked in kg, a naive deduction removes 150 kg. Wrong units corrupt stock silently, and the ledger is append-only, so the damage is permanent history.

## Options considered

1. **Must match** — recipe unit forced to equal the item's unit. No conversion; staff must type 0.15 kg.
2. **Fixed enum, convert within a dimension** — mass, volume and count units; any recipe unit in the item's dimension is converted exactly; cross-dimension rejected.
3. **Free conversion** — per-item densities and piece weights. Flexible, but needs extra data and invites rounding errors.

## Decision

Option 2. Units are a Postgres enum `unit`:

| Dimension | Units | Base |
| --- | --- | --- |
| MASS | `G`, `KG` (1 KG = 1000 G) | G |
| VOLUME | `ML`, `L` (1 L = 1000 ML) | ML |
| COUNT | `PCS` | PCS |

Every inventory item has one stock unit. The ledger (`quantity_delta`, `current_stock`, snapshots) is always in the item's stock unit. Any input in another unit of the same dimension is converted once, at the edge, by a pure function using `Decimal` factors (powers of ten, so conversion is exact). A unit from another dimension is rejected with `UNIT_DIMENSION_MISMATCH`.

## Consequences

- **Schema (B301):** `unit` enum on `inventory_items`, `menu_item_ingredients` and `inventory_item_components`. The unit→dimension map lives in code, not the database.
- **Catalog (B601):** creating or updating an ingredient line validates the dimension against the referenced inventory item; the stored line keeps the unit the user typed.
- **Ledger (B701):** the deduction converts each recipe line to the item's stock unit *before* aggregating per item (ARCHITECTURE §5).
- **Restock, waste, reconciliation (B702, B901, B902):** accept an optional input unit, converted the same way.
- **Changing an item's stock unit** after it has ledger rows is refused (`UNIT_CHANGE_NOT_ALLOWED`); it would reinterpret history.
- **Tests:** unit tests for the conversion function (every pair, both directions, exactness with `Decimal`), and an integration test where "150 G" against a KG item deducts 0.15.
- **Later:** adding a unit (e.g. `MG`, `TBSP`) is an enum value plus a table entry. Cross-dimension conversion (option 3) would need per-item conversion data; revisit only if staff ask for it.
