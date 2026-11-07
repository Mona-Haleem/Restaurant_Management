# ADR 0026 — Reports: local days, KPI rules and deduction anomalies

- **Status:** accepted
- **Date:** 2026-11-07
- **Answers:** ADR 0005 consequence (waste cost) · **Tickets:** B1101

## Context

ROADMAP B1101 asks for:
- revenue, order count, low-stock and waste-cost KPIs, plus date-range aggregates, computed in the database with day boundaries from the tenant's timezone;
- anomaly detection (deduction versus recipe expectation) as a pure function with a readable reason;
- query plans checked against tens of thousands of orders before adding indexes.

Grouping by local day needs `date_trunc(… AT TIME ZONE …)`, but feature code may not use raw SQL, because it skips the tenant scope (ADR 0015, rule 1). Several business rules were also unstated: which orders count, when revenue is earned, how waste is costed, and what to do when a recipe changed after delivery.

## Options considered

1. **Raw SQL with an explicit `tenant_id` filter.** One query per report, but an exception to rule 1 in feature code.
2. **Local-day boundaries in TypeScript, one Prisma aggregate per day.** The sums and counts stay in Postgres, through the tenant-scoped client. A report costs a few queries per day.
3. **A daily rollup table.** Fastest reads, but a second source of truth to keep in step. Premature for Phase 1.

## Decision

- **Days (option 2):** `local-day.ts` turns a tenant-local date into `[start, end)` UTC instants with `Intl`, which handles daylight saving with no dependency. Each day is aggregated in the database.
- **Routes:** `GET /reports/kpis?date=` (default today in the tenant's zone), `GET /reports/daily?from=&to=` (1–366 days, else `INVALID_DATE_RANGE`) and `GET /reports/anomalies?from=&to=`. MANAGER and ADMIN only, read-only, so non-demo tenants can read them too.
- **Revenue:** the `total` of orders that are not cancelled, counted on the day they reached a `deductsInventory` stage (from stage history; flags, never names, rule 2).
- **Order count:** non-cancelled orders placed that day (`created_at`).
- **Waste cost:** Σ(wasted quantity × the `unit_cost` stored on each WASTE row, ADR 0005), rounded half-up to money. Postgres sums the quantity per distinct cost (`groupBy unit_cost`), and the few products are multiplied as Decimals. Rows without a cost are excluded and counted in `uncostedWasteRows`.
- **Low stock:** the current count from B702's rule (negative, zero or below threshold; `StockService.lowStockCount`). It is the same for any date.
- **Branch scope:** the caller's branch. For an ADMIN with no branch chosen, all branches are combined (`branchId: null`).
- **Anomalies:**
  - **Which orders:** every non-cancelled order that reached a `deductsInventory` stage in the range.
  - **Expected:** `expandOrder` (B701) of the order's lines, using today's recipes.
  - **Actual:** the order's CONSUMPTION totals.
  - **Comparison:** the pure `checkDeduction` flags any item more than 0.001 off: `OVER_DEDUCTED`, `UNDER_DEDUCTED`, `NOT_IN_RECIPE` or `NOT_DEDUCTED`. The reason reads like "Potatoes: deducted 3× the recipe expectation (1.500 KG instead of 0.500 KG)."
  - **Recipe changed:** there is no recipe history. An order is listed under `unchecked`, rather than judged against a recipe it was not deducted with, when any of these changed after delivery:
    - its recipe lines (a recipe edit replaces them, ADR 0019, so new line times mark it);
    - its MIXED components;
    - its inventory items;
    - its menu item, but only when that item's recipe is now empty (a cleared recipe leaves no new lines).

    A menu item's own edit (price, name) does not hide its orders. An inventory item edit does: a unit or type change cannot be told apart from a cost edit yet.
  - **Counted once:** an order counts at its first move into a `deductsInventory` stage. A later stage that also deducts (ADR 0022) counts neither its revenue again nor its anomaly check. Only the first move deducted, so it is the time compared with recipe changes.
- **Index (measured):** `order_stage_history (tenant_id, to_stage_key, created_at)`, migration `b1101_history_stage_time_idx`.

## Query plans (60 000 orders, 240 000 history rows, ~63 000 ledger rows; local Docker Postgres)

| Query | Before | With the index |
| --- | --- | --- |
| Order count, one day | index scan `orders (tenant_id, branch_id, created_at)`, 0.2 ms | same |
| Waste groupBy, one day | index scan `inventory_transactions (tenant_id, branch_id, type, created_at)`, 0.1 ms | same |
| Revenue, one day | seq scan of all history, 30 ms | index scan on history, 14 ms |
| Anomaly deliveries, 31 days | seq scan of all history, 36 ms | bitmap index scan, 29 ms |

A summed id list (`id = ANY(…)` per day) measured no better (48 ms) and was not used.

## Consequences

- A KPI call is a handful of queries. A month of daily figures is about 31 × 3 aggregates (roughly 0.5 s at 500 orders a day), and the 366-day maximum is several seconds. If long ranges become common, add a daily rollup (option 3) or revisit raw SQL in an ADR.
- "Matches the seed exactly" is proven on a tenant built from the demo seed definition at a fixed time (`test/reports.e2e-spec.ts`), because other suites write to the demo tenant.
- Recipe history (versioned recipe lines) would let unchecked orders be checked; it needs its own ticket and migration.
- **Stage keys:** reports match `order_stage_history.to_stage_key` against today's deducting stage keys. History keeps keys as text without a foreign key (SCHEMA.md), so a Phase 3 stage rename must rewrite history keys too, or reports lose past revenue.
- **Long anomaly ranges:** a 366-day anomaly report loads every delivered order of the range into memory and passes their ids in `IN` lists. That is fine at Phase 1 volumes; batch it or cap the range if it grows.
- **Day starts:** `startOfLocalDay` settles on the earliest instant of the local date, which matters where daylight saving starts or ends at midnight (Cairo, Beirut). Unit-tested over every day of 2026 in four such zones.
