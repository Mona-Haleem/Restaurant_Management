# Backend Phase 1 — Task Tracker

Ticket details live in `docs/ROADMAP.md` §6. This file tracks order, status and blockers only. Claude updates the status column at the end of each `/ticket` run; you update it when you merge.

**Status:** `todo` · `blocked` · `in progress` · `in review` · `done`
**Who:** 🤖 Claude can do it end to end · 👤 needs you (accounts, dashboards, secrets, repo settings) · 🤝 Claude prepares files and a checklist, you do the account steps

| Order | Ticket | Title | Who | Depends on | Blocked by (ARCHITECTURE §10) | Status | PR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | B101 | Workspace, tooling and CI | 🤝 | — | — | done | [#11](https://github.com/Mona-Haleem/Restaurant_Management/pull/11) |
| 2 | B201 | Local DB, Supabase projects, env guards | 🤝 | B101 | — | done | [#13](https://github.com/Mona-Haleem/Restaurant_Management/pull/13) |
| 3 | B301 | Prisma schema and first migration | 🤖 | B201 | — | done | [#12](https://github.com/Mona-Haleem/Restaurant_Management/pull/12) |
| 4 | B302 | Schema review and ADRs | 🤖 | B301 | — | done | [#18](https://github.com/Mona-Haleem/Restaurant_Management/pull/18) |
| 5 | B401 | Idempotent seed | 🤖 | B302 | — | done | [#20](https://github.com/Mona-Haleem/Restaurant_Management/pull/20) |
| 6 | B501 | Config, validation, errors, logging | 🤖 | B201 | — | done | [#14](https://github.com/Mona-Haleem/Restaurant_Management/pull/14) |
| 7 | B502 | OpenAPI contract | 🤖 | B501 | Angular client + mock contract test wait for frontend TABLZ-401/402/403 (ADR 0012) | backend half done; frontend half blocked | [#15](https://github.com/Mona-Haleem/Restaurant_Management/pull/15) |
| 8 | B503 | Tenant context, auth seam, health, demo safety | 🤖 | B301, B501 | — | done | [#22](https://github.com/Mona-Haleem/Restaurant_Management/pull/22) |
| 9 | B601 | Menu, categories and ingredients | 🤖 | B503 | — | done | [#23](https://github.com/Mona-Haleem/Restaurant_Management/pull/23) |
| 10 | B701 | Deduction service (single entry point) | 🤖 | B503 | — | done | [#24](https://github.com/Mona-Haleem/Restaurant_Management/pull/24) |
| 11 | B702 | Stock queries and restock | 🤖 | B701 | — | done | [#25](https://github.com/Mona-Haleem/Restaurant_Management/pull/25) |
| 12 | B801 | Workflow stages and order lifecycle | 🤖 | B601, B701 | — | done | [#26](https://github.com/Mona-Haleem/Restaurant_Management/pull/26) |
| 13 | B802 | Order queries for the board and tracking | 🤖 | B801 | — | done | |
| 14 | B901 | Waste logging | 🤖 | B701 | — | done | |
| 15 | B902 | Reconciliation and snapshots | 🤖 | B701, B901 | — | done | |
| 16 | B1001 | Staff management | 🤖 | B503 | — | done | |
| 17 | B1101 | KPIs, aggregates and anomalies | 🤖 | B801, B901, B902 | — | done | |
| 18 | B1201 | API deployment (Vercel) | 👤 | B201, B503 | — | done (account steps confirmed 2026-11-07) | |
| 19 | B1202 | Migration workflows | 🤝 | B1201 | — | done (account steps confirmed 2026-11-07) | |
| 20 | B1203 | Keep-alive workflow | 🤝 | B1201 | — | done (account steps confirmed 2026-11-07) | |
| 21 | B1204 | Backups and restore drill | 🤝 | B1202 | — | in review (files done; account steps and the real drill in ADR 0031) | |
| 21b | B1205 | Demo-tenant reset and scheduled staging reseed | 🤝 | B1202 | — | todo | |
| 22 | B1301 | Swap mock for real (Angular) | 🤝 | B502, B1101 | — | todo | |
| 23 | B1401 | Final hardening and sign-off | 🤝 | all | — | todo | |

## Notes

- **Parallel work:** B501 can run alongside B301/B302. B901 and B1001 can run alongside B801. Don't run two tickets that both create Prisma migrations at the same time — merge one, then start the other.
- **B302 mapping is provisional:** `docs/MODEL-MAPPING.md` was built from the TABLZ-401 ticket text because the Angular models did not exist yet. When TABLZ-401 lands, check every row (and deviations D15, D16, D20) against the real interfaces.
- **Decimal wire format (ADR 0013):** the first ticket that returns a `Decimal` or `bigint` (B601 or B503) adds the string serializer and the OpenAPI `type: string` + `pattern`.
- **B401 follow-ups:** the staging reseed CI workflow belongs to B1205 (🤝, split from B1202 by ADR 0029, needs staging secrets); B701 switches the seed to the ledger service and owns the unit-conversion and expected-stock functions the seed copies (ADR 0016); B503 decides how the scheduled reseed restores the demo tenant after visitor writes.
- **B503 follow-ups:** B1205 builds the demo-tenant reset command and the scheduled staging reseed workflow (ADR 0017; split from B1202 by ADR 0029). The Decimal wire format is done in B601 (`src/common/decimal`). B1202/B1203: confirm on staging that `req.ip` is the client IP behind Vercel (trust proxy = 1 hop), and consider a `statement_timeout` for `/v1/health/db` (ADR 0018).
- **B601 follow-ups:** B702 adds the customer menu availability (out-of-stock) flag; item images need a `menu_items.image_url` ticket; B701 converts recipe units at deduction time (lines keep their entered unit, ADR 0019). The branch filter of the customer menu is proven by unit tests only: add an e2e case once a seeded tenant has two branches.
- **B701 follow-ups (ADR 0020):** B702 adds PURCHASE (using `nextAverageCost`) and B902 adds ADJUSTMENT + snapshot to `LedgerService`; B902 needs its own concurrency test for reading `max(seq)` under the stock row lock. B801 calls `deductOrder` and B901 calls `recordWaste` inside their own transactions. B702: `single-writer.spec.ts` matches any `currentStock:` assignment, so a low-stock `where`/`orderBy` will need the check narrowed to write payloads (and raw SQL on `current_stock`).
- **B801 follow-ups (ADR 0022):** B802 adds the board/detail queries and the guest `GET /track/:token` (with the same polling rules). An optional `fromStageKey` on advance would make sequential double clicks safe. Order creation has no idempotency key yet (needed for Phase 2 offline replay).
- **B702 follow-ups (ADR 0021):** no API yet to create inventory items or edit their low-stock thresholds (needs a ticket). E2E runs from a worktree under `.claude/worktrees/` need `--testMatch "**/test/*.e2e-spec.ts"`: the config's absolute glob does not match through the `.claude` folder.
- **B901 follow-ups:** The converted-quantity size check is done in B902 (`QUANTITY_TOO_LARGE`, ADR 0025). A waste list endpoint (`GET /waste`) was left out until a screen needs it (B1101). `BRANCH_REQUIRED` is unit-tested only: add an e2e case once a writable tenant has two branches.
- **B1001 follow-ups (ADR 0023):** B802 shows order/history actor names via a join on `users` without an `is_active` filter, and adds an API-level test for a deactivated worker's order (B1001 proves it at the DB level). Login (`argon2.verify`) and password changes are Phase 2.
- **B802 follow-ups (ADR 0024):** order lines do not keep the cart's order (`order_items.position` needs its own ticket and migration); `scope=active` is not paginated. Parallel sessions share `tablz_test`: two e2e runs at once break each other (one resets the database under the other), so check that nobody else is connected before running `test:e2e`.
- **B902 follow-ups (ADR 0025):** no read route for reconciliations yet (B1101 reads the table; add `GET /reconciliations` when a screen needs it). B702's expected-stock view still runs one sum query per counted item: now that counts write snapshots, replace it with one grouped query. `BRANCH_REQUIRED` is unit-tested only (as in B901). `reconcile` runs about 5 queries per line (branch and item looked up per line): batch them if 200-line sheets get slow. The race test covers counts against waste and restock on one item; a delivery whose recipe spans two items raced against a two-item sheet would prove the lock order with `deductOrder` too.
- **B1101 follow-ups (ADR 0026):** a 366-day daily report runs ~3 aggregates per day (several seconds at 500 orders/day): add a daily rollup if long ranges become common. Orders whose recipe changed after delivery are listed as unchecked until recipe lines are versioned (needs a ticket and migration). B1301 wires the dashboard cards and Reports screen to these routes.
- **B1201 follow-ups (ADR 0028):** done: the account steps and the live checks were confirmed on 2026-11-07. Still true: the in-memory rate limit is approximate on Vercel (per function instance), and the Supabase keep-alive is B1203.
- **B1203 follow-ups (ADR 0030):** the acceptance (two runs on the schedule, a failure email for a wrong URL) is shown on GitHub after the checklist in ADR 0030. ROADMAP §3's "monthly calendar check" is now a monthly reminder issue. If `production` gets required reviewers, move the keep-alive to its own environment.
- **B1204 follow-ups (ADR 0031):** create the read-only `backup` login and the `BACKUP_DATABASE_URL` / `BACKUP_PASSPHRASE` secrets per environment, run the workflow once by hand, then do the real drill on a production backup (`npm run db:restore`) and record it in `docs/RUNBOOK.md`. A lost passphrase makes its backups unreadable: keep both in the password manager. B1401 extends the runbook (Supabase paused, Vercel cold starts).
- **B1202 follow-ups (ADR 0029):** add `STAGING_DIRECT_URL` / `PROD_DIRECT_URL` with the Vercel secrets, check that the first staging deploy marked `tablz-staging` as `staging`, then run the optional live drill (a migration that fails only on deployed databases → staging deploy blocked → "Resolve failed migration" as `applied`; ADR 0029 checklist). Prisma does not wrap a migration in a transaction: keep migrations small. B1205: demo reset + scheduled staging reseed (needs the seed guards to allow the demo tenant on staging).
- **Frontend references:** B302 (TABLZ-401 models), B401 (TABLZ-404 seed), B502 (frontend mock handlers) and B1301 (TABLZ-403 service layer, TABLZ-1902 demo script) need the Angular repo. Per ADR 0001 this is a monorepo: start Claude Code in `backend/` with `--add-dir ../frontend` for those tickets.
- **👤 / 🤝 steps Claude must not attempt:** creating Supabase or Vercel projects, setting GitHub branch protection or secrets, configuring UptimeRobot, and anything that connects to staging or production.
