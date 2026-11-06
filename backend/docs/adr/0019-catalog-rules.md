# ADR 0019 — Catalog rules: recipe lines, menu roles, archived categories

- **Status:** accepted
- **Date:** 2026-11-06
- **Answers:** — · **Tickets:** B601, B701, B1001

## Context

B601 builds the menu, categories and recipes. Four points were open:

- Editing a recipe can remove ingredient rows, but `menu_item_ingredients` has no archive flag and the scoped client refuses hard deletes (rule 5, ADR 0018).
- ARCHITECTURE §3 says a MANAGER may do "everything within their branch", while menu items are tenant-wide unless `branch_id` is set.
- Archiving a category that still has active items had no defined effect.
- The PRD menu screens show item images and grey out out-of-stock items; neither is in the schema or the ticket.

## Decision

1. **Recipe lines can be replaced.** A recipe is configuration, not history: orders copy name and price (`order_items`), and the ledger keeps what was consumed. Sending `ingredients` on an edit deletes the item's lines and writes the new ones in one transaction. The scoped client allows `delete`/`deleteMany` on `menu_item_ingredients` only; every other table still refuses hard deletes.
2. **ADMIN and MANAGER manage the whole menu** (categories, tenant-wide and branch items). WORKER and guests cannot. Branch-restricted managers come with Phase 2 permissions.
3. **An archived category hides its items** from the customer menu. The items keep their own status, so re-activating the category brings them back. New items cannot be created in an archived category (`400 CATEGORY_NOT_FOUND`).
4. **Deferred:** item images (no column, no upload in Phase 1) and the customer menu's out-of-stock flag (derived from stock, B702).

Recipe validation (`INVALID_RECIPE`, with one `details.issues[]` entry per bad row): the inventory item must be an active item of the tenant; each item at most once; the unit must match the item's dimension (ADR 0003); the quantity must be positive and still fit numeric(14,3) once converted to the stock unit, both decimals (`INGREDIENT_QUANTITY_TOO_PRECISE`) and integer digits (`INGREDIENT_QUANTITY_TOO_LARGE`) (ADR 0013). Recipe lines keep the unit they were entered in; B701 converts at deduction time.

## Consequences

- PATCH semantics: an absent field is unchanged; `null` is accepted only where it means something (`branchId` = every branch, `description` = cleared) and is a 400 elsewhere (`IsOptionalNotNull`). Names are trimmed, so a padded duplicate category name is still taken. Resending an item's current category is allowed even if that category is archived.
- On a tenant with several branches, a guest has no branch (ADR 0007) and sees only all-branch items until the branch picker (Phase 2).

- The customer menu returns only ACTIVE items in active categories, sold in the caller's branch or in every branch, plus the categories that have visible items.
- Recipe lines come back sorted by inventory item name: lines written together share `created_at`, so insertion order is not recoverable.
- Money and quantities are strings in requests and responses (ADR 0013), validated by `IsDecimalString` and formatted by `formatDecimal` (`src/common/decimal`); unit conversion lives in `src/common/units` and the seed uses the same function.
- B702 adds an availability flag to the customer menu; a later ticket can add `menu_items.image_url`.
- If recipe history is ever needed (e.g. "what did this burger contain in March"), add versioned recipes instead of deletes.
