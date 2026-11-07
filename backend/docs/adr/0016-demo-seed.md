# ADR 0016 — Demo seed: insert-missing, deterministic, and the one other stock writer

- **Status:** accepted
- **Date:** 2026-11-06
- **Answers:** — · **Tickets:** B401, B503, B701, B1205

## Context

B401 needs a demo tenant with orders in every stage, inventory backed by ledger rows, waste and a reconciliation with its snapshot. Running it twice must give the same state, and it must run only on local and test. Three things were not covered by earlier decisions:

- **Stock writer.** CLAUDE.md rule 3 says only the ledger service changes `current_stock`, but B701 (the ledger service) comes after B401.
- **What "idempotent" means.** Either a rerun changes nothing, or it restores the demo tenant to the seeded state. Restoring would mean removing rows visitors created, which conflicts with rule 5 (no hard deletes) and the append-only ledger.
- **Source.** The frontend's TABLZ-404 seed does not exist yet, so the content is written here.

## Options considered

1. **Wait for B701** and seed through the ledger service — keeps rule 3 literal, delays every demo and B503's isolation tests.
2. **Seed-only writer now** — the seed writes ledger rows, snapshots and `branch_stock` in one transaction, with stock computed from those same rows.
3. **Restore on rerun** — delete or reverse visitor changes on the demo tenant; needs hard deletes or compensating rows.

## Decision

Option 2, with insert-missing reruns (not option 3).

- Every seed row has a deterministic id (`seedId`, a name-based uuid v5). The writer uses `createMany({ skipDuplicates })`, so a rerun inserts only missing rows and never updates or deletes.
- Times are relative to the first run, so a fresh database looks like "today"; later runs keep the original rows.
- `src/prisma/seed/write-seed.ts` is the only code besides the ledger service that writes `inventory_transactions` and `branch_stock.current_stock`. It writes them in one transaction per tenant. The builder walks the ledger in time order with the ADR 0005 cost rules, so `current_stock = latest snapshot + Σ quantity_delta since` holds by construction; unit and e2e tests check it.
- A snapshot's `through_seq` is read from the database (`max(seq)` for that branch and item) after the rows before it are inserted.
- Guest orders get **demo tracking tokens** derived from the order key, in the same format as ADR 0008's random tokens. They are public by design (the seed prints them) and exist only on seeded orders.
- The seed refuses anything but `APP_ENV=local|test` with a local URL and a matching `app_environment` marker. Staging reseeding is a CI workflow in B1205 (split from B1202, ADR 0029).
- The content stands in for TABLZ-404. It has no combo item, because the B301 CHECK keeps `is_combo` false in Phase 1.

## Consequences

- B701 should make the seed call the ledger service (or its pure functions) and drop the seed's copies of unit conversion (`quantities.ts`) and the stock walk.
- B503's scheduled reseed cannot rely on this seed to undo visitor writes; it decides its own approach (e.g. drop and recreate the demo tenant through a dedicated, audited path).
- After a content change, a rerun inserts the new rows (e.g. a new order's CONSUMPTION rows) but never updates existing ones, including `branch_stock`, so stock would stop matching the ledger. Reset the local database first (`db:reset`, then `db:seed`).
- The e2e run leaves both seed tenants in `tablz_test` for the suites after it; later suites must not count all tenants or rows (relevant for B503's isolation tests).
- When TABLZ-404 lands, align the frontend mock data with `src/prisma/seed/demo-data.ts` (or generate one from the other).
