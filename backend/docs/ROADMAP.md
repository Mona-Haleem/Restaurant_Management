# Tablz — Backend Phase 1 Roadmap

*Companion to the PRD and the Phase 1 frontend roadmap · free-tier services only · prepared 28 Oct 2026*

## 1. Scope & assumptions

**Backend Phase 1** is the real backend for everything the frontend Phase 1 contract needs: menu, orders with the configurable workflow, the inventory ledger, waste, reconciliation, staff (simple roles) and reports. Per the PRD it is built after frontend Phase 2, but the schema work (B3) can start earlier because the schema must be settled before implementation.

- **Stack:** NestJS (TypeScript, strict) · Prisma · PostgreSQL · OpenAPI. Production DB: Supabase. Development DB: local Postgres in Docker (see §2).
- **Out of scope (backend Phase 2):** JWT login and password reset, detailed per-user permission enforcement, Paymob, reservations, offers/combos, tenant onboarding, notifications/SSE, offline replay.
- **Auth seam:** Phase 1 has no real login (the frontend uses a Role Picker). The backend reads the caller's role and tenant from one swappable provider (a dev header such as `x-dev-role`), mirroring TABLZ-302, so JWT in Phase 2 changes where the role comes from and never touches the guards.
- **Known risk:** a spoofable role header on a public API is acceptable only for a demo tenant with seed data. B5 adds rate limiting and a scheduled reseed; no real tenant may exist before JWT ships.
- Free-tier limits quoted here were checked in Oct 2026 and change often. Recheck before relying on them.

## 2. Environments & database separation

| Environment | Database | API | Changed by |
| --- | --- | --- | --- |
| local | Postgres in Docker | `npm run start:dev` | you, via `prisma migrate dev` |
| test | throwaway Postgres (local container, CI service container) | Jest + Supertest | automated, recreated every run |
| staging | Supabase project #2 `tablz-staging` | Vercel project `tablz-api-staging`, deployed by CI after a merge to `main` ([ADR 0028](adr/0028-vercel-deployment.md); was Render) | CI only (`migrate deploy`) |
| production | Supabase project #1 `tablz-prod` | Vercel project `tablz-api-production`, deployed only by the manual workflow (ADR 0028) | CI only, manual trigger with confirmation |

**Why not SQLite for development.** Prisma binds a schema to one database provider, and SQLite differs from Postgres exactly where Tablz is strict: enums, `numeric` money and stock columns, JSON, row locking, transaction behavior and later RLS. Tests that pass on SQLite and fail on Postgres are worse than no tests, and the ledger and mixed-item cascade need the real engine.

**Why development should not point at Supabase.** The free plan allows only two active projects (those are staging and production), has no automatic backups, and pauses when idle. A dev loop that resets data constantly does not belong there. Local Docker Postgres is free, instant, works offline and is disposable. (`supabase start` from the Supabase CLI is an alternative if you later use Supabase-specific features locally.)

**How the separation is enforced, not just documented:**

1. One `.env.example` is committed. Real `.env.*` files are gitignored. Staging and production secrets exist only in Vercel, GitHub secrets and your password manager, with different passwords and project refs per environment.
2. Two connection strings per environment: `DATABASE_URL` (pooled, for the running app) and `DIRECT_URL` (for migrations). Use the strings from the Supabase dashboard. Migrations and backups run from GitHub's runners, which are IPv4, so use the pooler/session string if the direct host turns out to be IPv6-only (verify in B2).
3. A single-row `app_environment` table holds `local`, `staging` or `production`. At boot the API compares it with `APP_ENV` and refuses to start on a mismatch, so a production URL pasted into a local `.env` cannot be used by accident.
4. Destructive commands (`migrate reset`, seed, truncate scripts) hard-fail unless `APP_ENV` is `local` or `test`.
5. Migrations are forward-only and committed. `migrate dev` runs only locally. Staging and production receive `migrate deploy` from CI, never from a laptop.
6. The production deploy and migration is a separate manual workflow where you must type the target environment as an input.
7. Frontend side: Vercel preview deployments point only at the staging API. Only the production frontend points at the production API.

## 3. Keeping free services alive

| Service | Idle behavior | Protection |
| --- | --- | --- |
| Supabase (staging + production) | free projects pause after 7 days without activity | scheduled workflow every 3 days runs a real query against each database; the backup job also counts as activity |
| Vercel Functions (the API, ADR 0028) | no long-running server: a cold start takes a moment after idle time; nothing is deleted | none needed for the API itself; the Supabase keep-alive above still runs |
| GitHub scheduled workflows | disabled after 60 days without repository activity (documented for public repos; verify for your private repo) | a self-heal job makes a commit only when the last commit is older than 45 days; a second independent monitor (for example UptimeRobot) pings `/health/db`; monthly calendar check of the Actions tab |
| Vercel | no idle deletion known | none needed; watch account emails |

Failures must be loud: any timeout or non-200 makes the workflow exit non-zero so GitHub emails you, instead of silently passing.

## 4. Schema overview (PostgreSQL via Prisma)

Rules for every table: `uuid` primary keys; `tenant_id` on every tenant-owned table with indexes starting `(tenant_id, …)`; money and stock as `numeric`, never float; `created_at` and `updated_at`; archive or deactivate instead of delete; cross-table references include `tenant_id` so a row can never point at another tenant's row.

- **Tenancy & people:** `tenants` (unique slug, timezone), `branches`, `users` (role ADMIN | MANAGER | WORKER, `is_active`), `role_permissions` and `user_permission_overrides` (created now, enforced in Phase 2).
- **Catalog:** `categories`, `menu_items` (price, status ACTIVE | ARCHIVED, `is_combo` reserved), `menu_item_ingredients` (menu item → inventory item, quantity, unit).
- **Inventory:** `inventory_items` (type RAW | READY | MIXED, cached `current_stock`, low-stock threshold, unit), `inventory_item_components` (MIXED item → raw components per unit), `inventory_transactions` (append-only; type PURCHASE | CONSUMPTION | WASTE | TRANSFER | ADJUSTMENT; `quantity_delta`; `related_order_id?`; `actor_id`), `inventory_snapshots`, `reconciliation_entries`, `waste_entries`.
- **Orders:** `order_workflow_stages` (per tenant: key, label, position, `cancellable`, `deducts_inventory`), `orders` (`stage_key`, `canceled_at`, `placed_by_type` STAFF | CUSTOMER | GUEST, `placed_by_id?`, total), `order_items` (name and unit price copied at order time), `order_stage_history`.
- **System:** `app_environment` (§2).

**Invariants:**

- Logic reads stage flags, never stage names or counts.
- A stock change and its transaction row are written in one database transaction.
- A unique key on `(related_order_id, inventory_item_id, type)` makes order deductions idempotent, which also prepares offline replay.
- Expected stock = latest snapshot + transactions since that snapshot.
- Tenant scoping is enforced in the application layer in Phase 1 (a Prisma client extension). Postgres RLS is a hardening ticket, because Prisma connecting as the database owner bypasses RLS unless the role is set per request.

## 5. Step breakdown

1. **B1** — Backend bootstrap, tooling & CI
2. **B2** — Environments, local DB & Supabase projects
3. **B3** — Schema & migrations
4. **B4** — Seed data & dev tooling
5. **B5** — Platform foundation (config, errors, OpenAPI, tenant/auth seam, health, demo safety)
6. **B6** — Catalog: menu, categories, ingredients
7. **B7** — Inventory ledger & deduction service
8. **B8** — Orders & workflow
9. **B9** — Waste, restock & reconciliation
10. **B10** — Staff
11. **B11** — Reports, KPIs & anomalies
12. **B12** — CD, keep-alive & backups
13. **B13** — Frontend integration (mock → real)
14. **B14** — Hardening & sign-off

## 6. Tickets

Every ticket is its own PR under the same branch protection, Conventional Commits and TDD rules as the frontend repo. Format: requirements, quality guidelines, acceptance criteria.

### B1 — Bootstrap

**TABLZ-B101 — Workspace, tooling and CI**

Requirements:

- [ ] NestJS project, TypeScript strict. Decide and document repo layout: separate `tablz-api` repo, or a monorepo with the Angular app (a monorepo makes sharing TypeScript models easy).
- [ ] ESLint, Prettier, Husky, lint-staged and commitlint; same branch protection, PR template and CODEOWNERS as the frontend.
- [ ] CI on every PR: lint, unit tests, integration tests against a Postgres service container, build, and a coverage threshold.

Quality guidelines: Node version pinned in `.nvmrc` and CI; `npm ci` only; no secrets in the repo.

Acceptance: a deliberately failing PR is blocked from merging; a coverage drop is blocked the same way; a green PR merges.

### B2 — Environments

**TABLZ-B201 — Local database, Supabase projects and environment guards**

Requirements:

- [ ] `docker-compose` Postgres using the same major version as the Supabase projects (check the dashboard).
- [ ] Two Supabase projects created and named per §2; `DATABASE_URL` / `DIRECT_URL` split; confirm which connection string works from GitHub's IPv4 runners.
- [ ] `app_environment` boot guard and destructive-command guards from §2.
- [ ] `docs/ENVIRONMENTS.md` explaining the table in §2, how to reset the local DB, and where each secret lives.

Quality guidelines: guards are unit-tested; no production or staging credential ever appears on a developer machine except in the password manager.

Acceptance: starting the API locally with a staging or production URL fails at boot with a clear message; `migrate reset` refuses on staging and production; a fresh clone reaches a working local database in two documented commands.

### B3 — Schema

**TABLZ-B301 — Prisma schema and first migration**

Requirements:

- [ ] Every table in §4, with foreign keys including `tenant_id`, unique constraints, check constraints (positive quantities and prices where applicable) and indexes for the known access paths (orders by stage, transactions by item and time).
- [ ] The first migration applies cleanly to an empty database locally and on staging.

Acceptance: no tenant-owned table lacks `tenant_id`; an ERD is committed to the repo; migrations replay from zero without manual steps.

**TABLZ-B302 — Schema review and ADRs**

Requirements:

- [ ] A mapping table from each TABLZ-401 TypeScript model to its table and columns, so Angular models and the database cannot drift silently.
- [ ] Short ADRs for: negative-stock policy, numeric precision, workflow stages as a table versus JSON, and the RLS decision (§4).

Acceptance: reviewed against PRD §7.3, §7.4 and §9, with every deviation written down.

### B4 — Seed data

**TABLZ-B401 — Idempotent seed**

Requirements:

- [ ] Port the TABLZ-404 seed to a script that creates a demo tenant: full menu, orders in every workflow stage plus a canceled one, all three inventory item types, one low-stock item, backing transactions, a waste entry, and a reconciliation with its snapshot.
- [ ] Runnable only when `APP_ENV` is `local` or `test`; staging reseeds through a CI workflow.

Acceptance: running it twice yields the same state; every scenario above is present and renders in the matching screen once integrated.

### B5 — Platform foundation

**TABLZ-B501 — Config, validation, errors, logging**

Requirements:

- [ ] Environment variables validated at startup (fail fast); global request validation; one consistent error shape (code, message, details); structured logs with a request id; CORS allowlist per environment.

Acceptance: a missing variable stops startup with a clear message; no endpoint returns a stack trace.

**TABLZ-B502 — OpenAPI contract**

Requirements:

- [ ] Versioned routes (`/v1`), generated OpenAPI spec, and a typed Angular client generated from it.
- [ ] A contract test proving the frontend's mock handlers still match the spec.

Quality guidelines: the spec is the single contract; the mock and the real API are both checked against it.

Acceptance: changing a response field breaks the contract test before it can break the frontend.

**TABLZ-B503 — Tenant context, auth seam, health and demo safety**

Requirements:

- [ ] Tenant and actor resolved by one swappable provider; a Prisma client extension adds `tenant_id` to every query and write.
- [ ] `/health` (cheap) and `/health/db` (runs a trivial query).
- [ ] Rate limiting, writes allowed only on the demo tenant, and a scheduled staging reseed.

Acceptance: a parametrized test proves tenant A cannot read or write tenant B's rows through any endpoint; `/health/db` fails when the database is unreachable.

### B6 — Catalog

**TABLZ-B601 — Menu, categories and ingredients**

Requirements:

- [ ] Create, edit and archive menu items (no hard delete); categories; ingredient rows referencing real inventory items with positive quantities.
- [ ] Archived items disappear from the customer menu query.

Acceptance: archiving removes an item from the customer menu response immediately; creating an item with a nonexistent or negative ingredient is rejected.

### B7 — Inventory ledger

**TABLZ-B701 — Deduction service (single entry point)**

Requirements:

- [ ] One service takes either an order's items or a manual waste quantity and, in one database transaction, writes the transaction rows and updates `current_stock` using atomic updates or row locks.
- [ ] MIXED items cascade to their raw components, each with its own transaction row.
- [ ] The idempotency key from §4 is enforced by the database.

Quality guidelines: orders and waste share this service. No other code path writes `current_stock`.

Acceptance: two simultaneous deliveries of the same order deduct once; a failure mid-cascade leaves no partial rows; stock equals latest snapshot plus transactions since, checked by a test over randomized sequences.

**TABLZ-B702 — Stock queries and restock**

Requirements:

- [ ] Expected-stock query, low-stock list, and restock as a PURCHASE transaction that adds to the current quantity.

Acceptance: restock increases a non-zero starting stock by the entered amount and produces a matching row.

### B8 — Orders & workflow

**TABLZ-B801 — Workflow stages and order lifecycle**

Requirements:

- [ ] Default four stages seeded per tenant; endpoint to read them.
- [ ] Create an order (`placed_by_type` GUEST in Phase 1); advance to the next stage by position; cancel only while the current stage is `cancellable`.
- [ ] Reaching a `deducts_inventory` stage calls the B701 service in the same transaction.
- [ ] Stage history recorded.

Quality guidelines: no code reads a stage key or label to decide behavior.

Acceptance: delivering twice deducts once; canceling after the cancellable stage is rejected; changing the stage config in a test changes behavior with no code change.

**TABLZ-B802 — Order queries for the board and tracking**

Requirements:

- [ ] Filter by stage and branch, order detail, and an `updatedSince` or ETag mechanism so frontend polling stays cheap.

Acceptance: an unchanged poll returns a cheap not-modified response; a status change appears in the next poll.

### B9 — Waste & reconciliation

**TABLZ-B901 — Waste logging**

Requirements:

- [ ] Waste entries go through the B701 service as WASTE transactions, with reason and actor.

Acceptance: logged waste reduces stock immediately and appears in the ledger.

**TABLZ-B902 — Reconciliation and snapshots**

Requirements:

- [ ] Compare physical count with expected stock (latest snapshot + transactions since), flag only the unexplained difference, and in one transaction write the reconciliation entry, an ADJUSTMENT transaction for the gap (so `current_stock` equals the physical count and the ledger stays balanced), and a new snapshot.

Quality guidelines: write the test for already-logged waste not being double-counted before the calculation.

Acceptance: waste-only scenarios flag zero; a genuine gap flags exactly that gap; the next expected-stock calculation uses the new snapshot.

### B10 — Staff

**TABLZ-B1001 — Staff management**

Requirements:

- [ ] List, create, deactivate (never delete) and assign simple roles; passwords hashed with argon2 and stored but no login endpoint yet; permission tables present but not enforced.

Acceptance: a deactivated worker disappears from active selections while historical orders still show their name.

### B11 — Reports

**TABLZ-B1101 — KPIs, aggregates and anomalies**

Requirements:

- [ ] Revenue, order count, low-stock and waste-cost KPIs and date-range aggregates computed in the database, with day boundaries from the tenant's timezone.
- [ ] Anomaly detection (deduction versus recipe expectation) as a pure function over query results, with a readable reason for each flag.

Quality guidelines: check query plans against a generated dataset of tens of thousands of orders before adding indexes.

Acceptance: each KPI matches the seed data exactly; a constructed bad deduction is flagged and a normal one is not.

### B12 — CD, keep-alive & backups

**TABLZ-B1201 — API deployment (Vercel; Render until 2026-11-07, ADR 0028)**

Requirements:

- [ ] Two Vercel projects (staging and production) with a health check on `/v1/health`, environment variables set in the dashboard, deploys triggered only after CI passes.

Acceptance: a merge to `main` updates staging with no manual step; production changes only through the manual workflow.

**TABLZ-B1202 — Migration workflows**

Requirements:

- [ ] Staging: `migrate deploy` on merge, before the app deploys. Production: manual `workflow_dispatch` with a typed confirmation input.
- [ ] A failed migration stops the deploy.

Quality guidelines: migrations are backward-compatible for one release (add before you remove), because old code runs briefly against the new schema.

Acceptance: a deliberately broken migration on staging blocks the deploy and leaves the previous version running.

**TABLZ-B1203 — Keep-alive workflow**

Requirements:

- [ ] A scheduled workflow (every 3 days, at an off-peak minute that is not :00) that calls `/health/db` on staging and production with a generous timeout and retries (to survive the host's (Vercel) cold start) and also runs a direct trivial query through the database connection.
- [ ] Any failure exits non-zero. A manual trigger exists for pre-demo warm-ups.
- [ ] A self-heal job that commits only when the repo has been quiet for more than 45 days, to avoid GitHub's 60-day disable rule.
- [ ] A second independent monitor outside GitHub pinging `/health/db`, and a monthly reminder to check the Actions tab.

Quality guidelines: pin third-party actions to a commit SHA or write the few lines yourself; limit the workflow token's permissions.

Acceptance: the workflow has run successfully on its own schedule at least twice; pointing it at a wrong URL makes it fail and sends an email.

**TABLZ-B1205 — Demo-tenant reset and scheduled staging reseed** (split from B1202, ADR 0029)

Requirements:

- [ ] A reset command that deletes every row of the `is_demo` tenant only (children first, one transaction) and re-runs the seed for it, and a scheduled staging workflow that runs it (ADR 0017).

Acceptance: after a reset, the demo tenant matches a fresh seed and another tenant's rows are unchanged.

**TABLZ-B1204 — Backups and restore drill**

Requirements:

- [ ] Scheduled `pg_dump` of production (and a lighter one for staging) stored as a private, time-limited artifact. Free Supabase projects do not include automated backups, so this is the only safety net.
- [ ] A documented restore into local Docker, performed once for real.

Acceptance: the drill succeeds and row counts match; the runbook states how long a dump is kept.

### B13 — Frontend integration

**TABLZ-B1301 — Swap mock for real**

Requirements:

- [ ] The Angular service layer (TABLZ-403) switches to the real API by environment configuration only. Vercel previews use the staging API; production uses the production API.
- [ ] The Phase 1 demo script (TABLZ-1902) runs against staging and then production.

Acceptance: the diff outside the service layer and environment files is empty; all seed scenarios render correctly; the demo script passes end to end.

### B14 — Hardening & sign-off

**TABLZ-B1401 — Final hardening**

Requirements:

- [ ] Cross-feature bug bash: double delivery, cancel after delivery, restock of a nonexistent item, concurrent reconciliation, archived item in an open order.
- [ ] Security basics: security headers, rate limits, no stack traces, dependency audit, Dependabot.
- [ ] Docs: README, ARCHITECTURE, ENVIRONMENTS and a RUNBOOK covering what to do when Supabase has paused (restore from the dashboard, then verify) and after a Vercel cold start.
- [ ] Release tag `v1.0.0-backend-phase1`.

Acceptance: every pipeline protection from B1 and B12 is confirmed intact; no unresolved undocumented critical bugs remain.

## 7. Definition of done for Backend Phase 1

- Schema matches the PRD (workflow stages as data, ledger with snapshots, tenant-scoped everywhere) and migrates cleanly from zero.
- Local, test, staging and production databases are provably separate, and a wrong-environment connection fails at boot.
- Production and staging stay awake against Supabase's 7-day pause through scheduled checks that have run on their own, and the checks fail loudly.
- Backups exist and a restore has been performed once.
- The frontend runs against the real API with no code change outside the service layer and environment configuration.
- Cross-tenant isolation and double-deduction protections are covered by automated tests.
