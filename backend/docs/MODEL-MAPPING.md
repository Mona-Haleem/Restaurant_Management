# Angular models ↔ database mapping (B302)

This page maps each TABLZ-401 TypeScript model to the tables and columns that store it, so the Angular models and the database cannot drift apart without anyone noticing.

> **Provisional.** The TABLZ-401 models are not written yet (`frontend/src/app/models/` is empty). The field names below come from the TABLZ-401 ticket text (`tasks/tablz-phase1-roadmap.md`) and PRD §7.3, §7.4 and §9. Where the ticket names no field, the name is **proposed**: the camelCase of the Prisma field, which is also what the API returns. Once TABLZ-401 lands, check every row again against the real interfaces (follow-up in `docs/TASKS.md`).

## How this page is checked

`src/prisma/model-mapping.spec.ts` runs on every `npm test` and fails when:

- a TABLZ-401 model has no section;
- a `table.column` below does not exist in `prisma/schema.prisma`;
- a table named on a section's `Tables:` line has a column this section does not list;
- a table in the schema is not covered by any section.

So a new, renamed or dropped column fails the test until this page is updated. The test checks only the database side. The Angular side is checked by reviewers until the frontend has its own contract test (B502 / B1301).

**Wire format** for every model ([ADR 0013](adr/0013-numeric-precision.md)): money, stock and cost values are JSON **strings** (`"12.50"`), never numbers, so Angular models type them as `string`. `seq` and `through_seq` are strings as well. Timestamps are ISO-8601 strings in UTC.

**Source column:** *spec* means TABLZ-401 or the PRD names the field. *proposed* means this page chose the name. *backend* means the column is not exposed in the model.

## Mapping

### User

Tables: `users`

| Model field | Column | Source | Notes |
| --- | --- | --- | --- |
| `id` | `users.id` | proposed | uuid |
| `tenantId` | `users.tenant_id` | spec | TABLZ-401: every model carries a tenant field |
| `branchId` | `users.branch_id` | proposed | null for ADMIN (all branches) |
| `name` | `users.name` | proposed | |
| `email` | `users.email` | proposed | nullable; unique per tenant |
| — | `users.password_hash` | backend | never leaves the API |
| `role` | `users.role` | spec | `ADMIN \| MANAGER \| WORKER`; see deviation D15 |
| `isActive` | `users.is_active` | proposed | deactivate, never delete |
| — | `users.is_demo` | backend | marks the demo actors of ADR 0007 |
| `createdAt` | `users.created_at` | proposed | |
| `updatedAt` | `users.updated_at` | proposed | |

### MenuItem

Tables: `menu_items`, `menu_item_ingredients`

| Model field | Column | Source | Notes |
| --- | --- | --- | --- |
| `id` | `menu_items.id` | proposed | |
| `tenantId` | `menu_items.tenant_id` | spec | |
| `categoryId` | `menu_items.category_id` | proposed | see Category below |
| `branchId` | `menu_items.branch_id` | proposed | null = every branch ([ADR 0004](adr/0004-tenant-definitions-branch-stock.md)) |
| `name` | `menu_items.name` | proposed | |
| `description` | `menu_items.description` | proposed | nullable |
| `price` | `menu_items.price` | proposed | money string, `numeric(12,2)` |
| `status` | `menu_items.status` | proposed | `ACTIVE \| ARCHIVED` |
| `isCombo` | `menu_items.is_combo` | proposed | reserved, always false in Phase 1 (D17) |
| `createdAt` | `menu_items.created_at` | proposed | |
| `updatedAt` | `menu_items.updated_at` | proposed | |
| `ingredients[].id` | `menu_item_ingredients.id` | proposed | TABLZ-401 "ingredient-consumption fields" |
| — | `menu_item_ingredients.tenant_id` | backend | same tenant as the menu item |
| — | `menu_item_ingredients.menu_item_id` | backend | implied by nesting under the menu item |
| `ingredients[].inventoryItemId` | `menu_item_ingredients.inventory_item_id` | proposed | |
| `ingredients[].quantity` | `menu_item_ingredients.quantity` | proposed | stock string, `numeric(14,3)`, per one menu item |
| `ingredients[].unit` | `menu_item_ingredients.unit` | proposed | same dimension as the item's unit ([ADR 0003](adr/0003-units-convert-within-dimension.md)) |
| — | `menu_item_ingredients.created_at` | backend | |
| — | `menu_item_ingredients.updated_at` | backend | |

### Order

Tables: `orders`, `order_items`, `order_stage_history`

| Model field | Column | Source | Notes |
| --- | --- | --- | --- |
| `id` | `orders.id` | proposed | |
| `tenantId` | `orders.tenant_id` | spec | |
| `branchId` | `orders.branch_id` | proposed | |
| `stageKey` | `orders.stage_key` | proposed | a key of `OrderWorkflowConfig.stages`; behavior reads the stage's flags, never the key |
| `canceledAt` | `orders.canceled_at` | proposed | non-null = cancelled (D3) |
| `status` | — | proposed | derived, not stored: `"cancelled"` when `canceled_at` is set, else the stage key ([ADR 0009](adr/0009-default-stage-keys.md), D3) |
| `placedBy.actorType` | `orders.placed_by_type` | spec | `STAFF \| CUSTOMER \| GUEST`; Phase 1 writes GUEST (D14) |
| `placedBy.actorId` | `orders.placed_by_id` | spec | null for GUEST |
| `total` | `orders.total` | proposed | money string |
| — | `orders.tracking_token_hash` | backend | the token itself is returned once at checkout ([ADR 0008](adr/0008-guest-order-tracking-token.md), D19) |
| `note` | `orders.note` | proposed | nullable |
| `createdAt` | `orders.created_at` | proposed | when the order was placed |
| `updatedAt` | `orders.updated_at` | proposed | board polling uses it (`updatedSince`, B802) |
| `items[].id` | `order_items.id` | proposed | |
| — | `order_items.tenant_id` | backend | |
| — | `order_items.order_id` | backend | implied by nesting |
| `items[].menuItemId` | `order_items.menu_item_id` | proposed | |
| `items[].name` | `order_items.name` | proposed | copied at order time (D18) |
| `items[].unitPrice` | `order_items.unit_price` | proposed | copied at order time, money string |
| `items[].quantity` | `order_items.quantity` | proposed | integer count of menu items, a JSON number |
| `items[].lineTotal` | `order_items.line_total` | proposed | money string |
| — | `order_items.created_at` | backend | |
| — | `order_items.updated_at` | backend | |
| `history[].id` | `order_stage_history.id` | proposed | optional, order details only |
| — | `order_stage_history.tenant_id` | backend | |
| — | `order_stage_history.order_id` | backend | implied by nesting |
| `history[].action` | `order_stage_history.action` | proposed | `PLACED \| ADVANCED \| CANCELED` |
| `history[].fromStageKey` | `order_stage_history.from_stage_key` | proposed | null on PLACED |
| `history[].toStageKey` | `order_stage_history.to_stage_key` | proposed | null on CANCELED |
| `history[].actorId` | `order_stage_history.actor_id` | proposed | null for a guest |
| `history[].at` | `order_stage_history.created_at` | proposed | |
| — | `order_stage_history.updated_at` | backend | rows are never updated |

### OrderWorkflowConfig

Tables: `order_workflow_stages`

The config is the tenant's stage rows sorted by `position`: `{ stages: OrderStage[] }` ([ADR 0014](adr/0014-workflow-stages-as-table.md)).

| Model field | Column | Source | Notes |
| --- | --- | --- | --- |
| — | `order_workflow_stages.id` | backend | orders reference a stage by key, not id |
| — | `order_workflow_stages.tenant_id` | backend | one config per tenant |
| `stages[].key` | `order_workflow_stages.key` | spec | defaults per [ADR 0009](adr/0009-default-stage-keys.md) (D1) |
| `stages[].label` | `order_workflow_stages.label` | spec | |
| `stages[].position` | `order_workflow_stages.position` | proposed | explicit order; the array is sorted by it (D2) |
| `stages[].cancellable` | `order_workflow_stages.cancellable` | spec | |
| `stages[].deductsInventory` | `order_workflow_stages.deducts_inventory` | spec | |
| — | `order_workflow_stages.created_at` | backend | |
| — | `order_workflow_stages.updated_at` | backend | |

### InventoryItem

Tables: `inventory_items`, `branch_stock`, `inventory_item_components`

An `InventoryItem` is read **for one branch**: the definition from `inventory_items` plus that branch's `branch_stock` row (D5).

| Model field | Column | Source | Notes |
| --- | --- | --- | --- |
| `id` | `inventory_items.id` | proposed | |
| `tenantId` | `inventory_items.tenant_id` | spec | |
| `name` | `inventory_items.name` | proposed | |
| `type` | `inventory_items.type` | spec | `RAW \| READY \| MIXED` (raw material / ready-to-buy / mixed-prepared) |
| `unit` | `inventory_items.unit` | proposed | stock unit: `G \| KG \| ML \| L \| PCS` |
| `standardUnitCost` | `inventory_items.standard_unit_cost` | proposed | cost string, fallback cost ([ADR 0005](adr/0005-cost-basis-moving-average.md)) |
| `isActive` | `inventory_items.is_active` | proposed | |
| `createdAt` | `inventory_items.created_at` | proposed | |
| `updatedAt` | `inventory_items.updated_at` | proposed | |
| — | `branch_stock.id` | backend | |
| — | `branch_stock.tenant_id` | backend | |
| `branchId` | `branch_stock.branch_id` | proposed | the branch the stock figures belong to |
| — | `branch_stock.inventory_item_id` | backend | equals `id` |
| `currentStock` | `branch_stock.current_stock` | spec | cached running total, may be negative ([ADR 0006](adr/0006-negative-stock-allow-and-flag.md)); MIXED: derived, no row (D6) |
| `lowStockThreshold` | `branch_stock.low_stock_threshold` | proposed | nullable |
| `avgUnitCost` | `branch_stock.avg_unit_cost` | proposed | weighted moving average |
| — | `branch_stock.created_at` | backend | |
| — | `branch_stock.updated_at` | backend | |
| `components[].id` | `inventory_item_components.id` | proposed | MIXED items only |
| — | `inventory_item_components.tenant_id` | backend | |
| — | `inventory_item_components.mixed_item_id` | backend | implied by nesting |
| `components[].inventoryItemId` | `inventory_item_components.component_item_id` | proposed | a RAW or READY item |
| `components[].quantity` | `inventory_item_components.quantity` | proposed | per one unit of the mixed item |
| `components[].unit` | `inventory_item_components.unit` | proposed | |
| — | `inventory_item_components.created_at` | backend | |
| — | `inventory_item_components.updated_at` | backend | |

### InventoryTransaction

Tables: `inventory_transactions`

| Model field | Column | Source | Notes |
| --- | --- | --- | --- |
| `id` | `inventory_transactions.id` | proposed | |
| `seq` | `inventory_transactions.seq` | proposed | ledger order, string (D8) |
| `tenantId` | `inventory_transactions.tenant_id` | spec | |
| `branchId` | `inventory_transactions.branch_id` | spec | |
| `itemId` | `inventory_transactions.inventory_item_id` | spec | renamed column (D7) |
| `type` | `inventory_transactions.type` | spec | `PURCHASE \| CONSUMPTION \| WASTE \| TRANSFER \| ADJUSTMENT` (D12) |
| `quantityDelta` | `inventory_transactions.quantity_delta` | spec | signed, in the item's stock unit |
| `unitCost` | `inventory_transactions.unit_cost` | proposed | cost at write time (D13) |
| `relatedOrderId` | `inventory_transactions.related_order_id` | spec | CONSUMPTION only |
| `actorId` | `inventory_transactions.actor_id` | spec | |
| `note` | `inventory_transactions.note` | proposed | |
| `timestamp` | `inventory_transactions.created_at` | spec | renamed column (D7) |
| — | `inventory_transactions.updated_at` | backend | append-only, never updated |

### InventorySnapshot

Tables: `inventory_snapshots`

| Model field | Column | Source | Notes |
| --- | --- | --- | --- |
| `id` | `inventory_snapshots.id` | proposed | |
| `tenantId` | `inventory_snapshots.tenant_id` | spec | |
| `branchId` | `inventory_snapshots.branch_id` | spec | |
| `itemId` | `inventory_snapshots.inventory_item_id` | spec | renamed column (D7) |
| `quantity` | `inventory_snapshots.quantity` | spec | |
| `throughSeq` | `inventory_snapshots.through_seq` | proposed | last ledger row included (D8) |
| `timestamp` | `inventory_snapshots.taken_at` | spec | renamed column (D7) |
| `reconciliationEntryId` | `reconciliation_entries.snapshot_id` | spec | the link is stored on the reconciliation side (D9) |
| — | `inventory_snapshots.created_at` | backend | |
| — | `inventory_snapshots.updated_at` | backend | |

### WasteEntry

Tables: `waste_entries`

| Model field | Column | Source | Notes |
| --- | --- | --- | --- |
| `id` | `waste_entries.id` | proposed | |
| `tenantId` | `waste_entries.tenant_id` | spec | |
| `branchId` | `waste_entries.branch_id` | proposed | |
| `itemId` | `waste_entries.inventory_item_id` | proposed | same name as on the ledger |
| `quantity` | `waste_entries.quantity` | proposed | as entered, positive |
| `unit` | `waste_entries.unit` | proposed | as entered; the ledger row holds the converted value |
| `reason` | `waste_entries.reason` | proposed | |
| `transactionId` | `waste_entries.transaction_id` | proposed | its WASTE ledger row |
| `actorId` | `waste_entries.actor_id` | proposed | |
| `timestamp` | `waste_entries.created_at` | proposed | |
| — | `waste_entries.updated_at` | backend | |

### ReconciliationEntry

Tables: `reconciliation_entries`

| Model field | Column | Source | Notes |
| --- | --- | --- | --- |
| `id` | `reconciliation_entries.id` | proposed | |
| `tenantId` | `reconciliation_entries.tenant_id` | spec | |
| `branchId` | `reconciliation_entries.branch_id` | proposed | |
| `itemId` | `reconciliation_entries.inventory_item_id` | proposed | one entry per item (D10) |
| `countedQuantity` | `reconciliation_entries.counted_quantity` | proposed | the physical count |
| `expectedQuantity` | `reconciliation_entries.expected_quantity` | proposed | snapshot + ledger since |
| `gap` | `reconciliation_entries.gap` | proposed | counted − expected; logged waste is never part of it |
| `adjustmentTransactionId` | `reconciliation_entries.adjustment_transaction_id` | proposed | null when the gap is zero |
| `snapshotId` | `reconciliation_entries.snapshot_id` | spec | the snapshot this entry produced |
| `actorId` | `reconciliation_entries.actor_id` | proposed | |
| `note` | `reconciliation_entries.note` | proposed | |
| `timestamp` | `reconciliation_entries.created_at` | proposed | |
| — | `reconciliation_entries.updated_at` | backend | |

### Category (not in TABLZ-401)

Tables: `categories`

The menu filter (PRD §8.1) needs categories; TABLZ-401 should add a `Category` model (follow-up).

| Model field | Column | Source | Notes |
| --- | --- | --- | --- |
| `id` | `categories.id` | proposed | |
| `tenantId` | `categories.tenant_id` | proposed | |
| `name` | `categories.name` | proposed | |
| `position` | `categories.position` | proposed | display order |
| `isActive` | `categories.is_active` | proposed | |
| — | `categories.created_at` | backend | |
| — | `categories.updated_at` | backend | |

### Backend only (no Angular model)

Tables: `app_environment`, `tenants`, `branches`, `role_permissions`, `user_permission_overrides`

Tenant and branch come from the URL slug and the request context ([ADR 0007](adr/0007-request-context-slug-and-demo-users.md)), so Phase 1 has no Angular model for them. A branch picker for ADMIN may later need a small `Branch { id, name }`.

| Model field | Column | Source | Notes |
| --- | --- | --- | --- |
| — | `app_environment.id` | backend | single row, boot guard ([ADR 0011](adr/0011-environment-guards.md)) |
| — | `app_environment.name` | backend | |
| — | `app_environment.created_at` | backend | |
| — | `app_environment.updated_at` | backend | |
| — | `tenants.id` | backend | the `tenantId` of every model |
| — | `tenants.slug` | backend | the `/v1/:tenantSlug/` path segment |
| — | `tenants.name` | backend | |
| — | `tenants.timezone` | backend | reports group by local day |
| — | `tenants.is_demo` | backend | writes only on the demo tenant in Phase 1 |
| — | `tenants.is_active` | backend | |
| — | `tenants.created_at` | backend | |
| — | `tenants.updated_at` | backend | |
| — | `branches.id` | backend | the `branchId` of other models |
| — | `branches.tenant_id` | backend | |
| — | `branches.name` | backend | |
| — | `branches.is_active` | backend | |
| — | `branches.created_at` | backend | |
| — | `branches.updated_at` | backend | |
| — | `role_permissions.id` | backend | Phase 2 seam, unenforced |
| — | `role_permissions.tenant_id` | backend | |
| — | `role_permissions.role` | backend | |
| — | `role_permissions.permission` | backend | |
| — | `role_permissions.created_at` | backend | |
| — | `role_permissions.updated_at` | backend | |
| — | `user_permission_overrides.id` | backend | Phase 2 seam, unenforced |
| — | `user_permission_overrides.tenant_id` | backend | |
| — | `user_permission_overrides.user_id` | backend | |
| — | `user_permission_overrides.permission` | backend | |
| — | `user_permission_overrides.granted` | backend | |
| — | `user_permission_overrides.created_at` | backend | |
| — | `user_permission_overrides.updated_at` | backend | |

## Deviations

Reviewed against PRD §7.3 (workflow), §7.4 (ledger and snapshots) and §9 (Angular models), and the TABLZ-401 ticket. Every place where the backend differs is listed here, with the decision behind it.

| # | Source says | Backend does | Why |
| --- | --- | --- | --- |
| D1 | PRD §7.3 / TABLZ-401: default keys `pending / preparing / ready / completed` | Keys `pending / in-preparation / ready / delivered`; labels unchanged | Match the Angular app's existing constants ([ADR 0009](adr/0009-default-stage-keys.md)). TABLZ-401's default config must use these keys. |
| D2 | PRD §7.3: order is the position in the `stages` list | Explicit `position` column, unique per tenant | Rows have no inherent order ([ADR 0014](adr/0014-workflow-stages-as-table.md)). The API returns `stages` sorted by position, so the frontend shape is the same. |
| D3 | PRD §4 lists cancel as an outcome; the Angular app has a `cancelled` constant | `cancelled` is not a stage; it is `canceled_at` being set | [ADR 0009](adr/0009-default-stage-keys.md): the API returns a derived `status` (`"cancelled"` when `canceledAt` is set, else the stage key) next to `stageKey`. The Angular status badge reads `status`; order behavior still reads only the stage flags. |
| D4 | PRD §7.3: `OrderWorkflowConfig` is one object per tenant | One row per stage in `order_workflow_stages` | Orders reference a stage through a composite FK (history copies the key as text), per-row flags, Phase 3 editing ([ADR 0014](adr/0014-workflow-stages-as-table.md)). |
| D5 | PRD §7.4 / TABLZ-401: `InventoryItem.currentStock` is a field on the item | Stock lives in `branch_stock (branch, item)`; the item is a tenant-wide definition | Per-branch stock ([ADR 0004](adr/0004-tenant-definitions-branch-stock.md)). The API returns an item with the stock of one branch, so `currentStock` stays a plain field in the Angular model, next to `branchId`. |
| D6 | PRD §8.3: preparing a mixed item adds to its own stock | MIXED items have no own stock; deductions cascade one level to their components | [ADR 0002](adr/0002-mixed-items-derived-stock.md). `currentStock` of a MIXED item is derived (or absent) in Phase 1. |
| D7 | PRD §7.4: `itemId`, `timestamp` | Columns `inventory_item_id`, `created_at` (snapshots: `taken_at`) | Naming rules (snake_case, `created_at` on every table). The API may keep the PRD names; this page is the translation. |
| D8 | PRD §7.4: `currentStock = last snapshot + sum(transactions since)` | "Since" means `seq > through_seq`, not a later timestamp | Rows written in one transaction share `now()`; `seq` gives a strict order ([SCHEMA.md](SCHEMA.md)). `current_stock` stays a cached total written only by the ledger service; B701 tests that it equals the formula. |
| D9 | TABLZ-401: snapshot has `reconciliationEntryId` | `reconciliation_entries.snapshot_id` (unique), one-to-one | The entry is written after its snapshot in one transaction; one FK direction avoids a cycle. The API can still return `reconciliationEntryId` on the snapshot. |
| D10 | PRD §4 step 8 / §9: "a reconciliation" per count | One `reconciliation_entries` row per (branch, item) counted | Gap, ADJUSTMENT row and snapshot are per item. A count of many items is many entries written together (B902). |
| D11 | PRD §7.4: compact old transactions into summary rows and archive or drop them | Not built; never delete | Deferred to Phase 2, archive-only ([ADR 0010](adr/0010-ledger-compaction-deferred.md)). |
| D12 | PRD §7.4: type includes `TRANSFER` | Enum value exists; no Phase 1 flow writes it | No transfer between branches in Phase 1 scope. |
| D13 | PRD §7.4: transaction has no cost | `unit_cost` on every row; `avg_unit_cost` on `branch_stock`; `standard_unit_cost` on the item | Waste-cost KPI ([ADR 0005](adr/0005-cost-basis-moving-average.md)). |
| D14 | PRD §9: `placedBy: { actorType, actorId }` nested | Two columns, `placed_by_type` and `placed_by_id` | Postgres columns are flat; the API returns the nested object. Values match: `STAFF \| CUSTOMER \| GUEST`. |
| D15 | Angular `UserRole` = `'customer' \| 'worker' \| 'manager' \| 'admin' \| 'guest'` (lowercase) | `user_role` = `ADMIN \| MANAGER \| WORKER` | Customers and guests are not staff users; they appear only as `placedBy.actorType`. The API sends the uppercase enum. **TABLZ-401 must either use these values for `User.role` or map them** (follow-up). |
| D16 | PRD and TABLZ-401 say nothing about number types | Money, stock and cost are `numeric`, sent as JSON strings | Exact decimals ([ADR 0013](adr/0013-numeric-precision.md)). Angular models type these fields as `string` and do math with a decimal library, never `number`. |
| D17 | TABLZ-401: `MenuItem` includes combo fields | Only `is_combo` is reserved; no combo-components table | Combos are Phase 2+ (ARCHITECTURE §1). |
| D18 | PRD: an order lists its menu items | `order_items` copies `name` and `unit_price` at order time | Menu edits never rewrite history (ARCHITECTURE §4). |
| D19 | TABLZ-401 has no guest tracking field | `tracking_token_hash` on the order; the raw token is returned once at checkout and never stored | Guests track or cancel only their own order ([ADR 0008](adr/0008-guest-order-tracking-token.md)). The Angular app stores the token, not the hash. |
| D20 | TABLZ-401 / PRD §9: no categories model | `categories` table, `menu_items.category_id` required | The menu filters by category (PRD §8.1). TABLZ-401 should add `Category` (follow-up). |
| D21 | ROADMAP B301: positive quantities and prices | Prices, totals and costs are `>= 0`; quantities stay `> 0` | Free menu items (a 0 price) are real ([SCHEMA.md](SCHEMA.md)). |
| D22 | ARCHITECTURE §4: composite FKs keep every row consistent | The `(tenant_id, id)` FKs keep links inside the tenant, but do not check that a waste entry's ledger row, or a reconciliation's ADJUSTMENT row and snapshot, belong to the same branch and item, or that the ledger row has the right type | B901/B902 write these rows together in one transaction and guarantee it in the service, with tests. Widening the FKs to `(tenant_id, branch_id, inventory_item_id, id)` stays possible later ([SCHEMA.md](SCHEMA.md)). |
| D23 | TABLZ-1203 (frontend): an item with no snapshot starts from its seeded quantity | No snapshot = 0 + every ledger row for that (branch, item) | `current_stock` must equal snapshot + ledger (B701). B401 writes PURCHASE rows (or a snapshot) behind every seeded stock figure. |
