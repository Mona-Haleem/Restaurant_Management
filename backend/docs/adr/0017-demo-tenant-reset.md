# ADR 0017 — Scheduled reseed resets the demo tenant only

- **Status:** accepted
- **Date:** 2026-11-06
- **Answers:** ADR 0016 open point ("B503 decides how the scheduled reseed restores the demo tenant") · **Tickets:** B503, B1205 (was B1202, see ADR 0029)

## Context

ROADMAP B503 asks for a scheduled staging reseed. In Phase 1 anyone can claim any role with a header, so visitors will write to the demo tenant (`nile-bites`): new orders, waste, restocks. The seed (ADR 0016) only inserts missing rows, so rerunning it never removes what visitors added. CLAUDE.md rule 5 forbids hard deletes of business data, and the ledger is append-only.

## Options considered

1. **Never restore** — the reseed only inserts missing rows; visitor data piles up until someone resets the whole staging database by hand.
2. **Reset the demo tenant** — delete every row of the demo tenant only, then run the seed again.
3. **Compensating rows** — reverse visitor changes with ADJUSTMENT rows and cancellations. Keeps rule 5 literally, but the demo never returns to the seeded state and the ledger fills with noise.

## Decision

Option 2. A dedicated **demo reset** step deletes all rows that belong to the tenant with `is_demo = true` (children first, in one transaction), then runs the normal seed for that tenant.

- It is the one exception to rule 5. Demo data is disposable by definition: it is seeded, public, and holds nothing real. No real tenant may exist before JWT ships (ROADMAP known risk), and the step refuses any tenant that is not `is_demo`.
- It never touches another tenant, `tenants` rows themselves (the demo tenant row and its id stay), or `app_environment`.
- It runs only from the scheduled CI workflow on staging and on local/test. It is never exposed over HTTP.

## Consequences

- **B1205** (split from B1202 by [ADR 0029](0029-migration-workflows.md)) builds the reset command (with tests that another tenant's rows survive) and the scheduled staging workflow (🤝: needs staging secrets). B503 ships no reset code.
- Seeded tracking tokens stay valid after a reset, because the seed is deterministic (ADR 0016).
- Visitors may see their changes vanish at the scheduled time; the demo banner should say so (frontend).
- When JWT ships and real tenants exist, revisit: the reset stays limited to `is_demo` tenants.
