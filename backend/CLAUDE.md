# Tablz API

NestJS backend for Tablz, a multi-tenant restaurant management system. Current scope: **Backend Phase 1 only** (no login, no payments; see ARCHITECTURE §1).

## Sources of truth

@docs/ARCHITECTURE.md

- `docs/ROADMAP.md` — ticket requirements, quality guidelines and acceptance criteria. Read the ticket before planning it.
- `docs/TASKS.md` — ticket order, dependencies, blockers, status.
- `docs/PRD.md` — product requirements, mostly frontend/UI. Backend-relevant sections: §4, §6, §7.1, §7.3, §7.4, §8, §9, §13. Read only the sections you need.
- `docs/adr/` — decisions. Check before re-deciding anything.

If sources conflict, the roadmap wins over the PRD (e.g. PRD §10's Express/Mongo is replaced by NestJS/Prisma/Postgres). If something is still unspecified or contradictory, **stop and ask** — never guess a business rule. Open questions are listed in ARCHITECTURE §10.

## Stack

NestJS (TypeScript strict) · Prisma · PostgreSQL · OpenAPI · Jest + Supertest. Local DB: Postgres in Docker. Staging/production: Supabase, reached only from CI. Hosting: Vercel (the API as a Vercel Function, ADR 0028).

## Commands

Keep this section accurate. Run from `backend/`, Node 24 (root `.nvmrc`).

- Install: `npm ci` (never `npm install` without asking — it rewrites the lockfile)
- Dev server: `npm run start:dev` · Build: `npm run build` (→ `dist/`)
- Lint: `npm run lint` (zero warnings) · Format: `npm run format` / `npm run format:check` · Types: `npm run typecheck`
- Unit tests: `npm run test` · With coverage gate (80% global, what CI runs): `npm run test:cov`
- Integration tests: `npm run test:e2e` (builds first, resets `tablz_test` from the migrations, then runs `test/**/*.e2e-spec.ts` in band against real Postgres via `TEST_DATABASE_URL`)
- Tests run through `node --experimental-vm-modules` because NestJS 12 is ESM-only; the warning it prints is expected.
- Local DB: `npm run db:up` (Docker `db` on host port 5433 + migrations) · `npm run db:seed` (demo tenants, re-runnable, ADR 0016) · `npm run db:status` · `npm run db:down` — see `docs/ENVIRONMENTS.md`
- New migration (local only): `npx prisma migrate dev --name <name>` (use `--create-only` when you need to add SQL such as CHECK constraints)
- Schema: `npm test` checks the table rules (`src/prisma/schema-rules.spec.ts`) and that `docs/MODEL-MAPPING.md` lists every column (`src/prisma/model-mapping.spec.ts`; update it when a column changes); after changing `prisma/schema.prisma` run `npm run erd:generate` (rewrites `docs/ERD.md`). Rules and decisions: `docs/SCHEMA.md`.
- OpenAPI: `npm run openapi:generate` rewrites `openapi.json` (commit it). `npm test` fails when it is out of date. Served at `/v1/openapi.json`; UI at `/v1/docs` (not on production).
- Env: `.env` if present, else `.env.example`; already-set variables win. `prisma.config.ts` refuses destructive Prisma commands unless `APP_ENV` is local/test with local URLs (ADR 0011).

## Rules that are never broken

1. **Tenant isolation.** Every tenant-owned table has `tenant_id`. Feature code uses the tenant-scoped Prisma client only.
2. **Stage flags, not names.** Order behavior reads `cancellable`, `deducts_inventory` and `position`. Never compare a stage key or label.
3. **Single ledger writer.** Only the ledger service changes `current_stock`, always in the same DB transaction as its `inventory_transactions` rows.
4. **Decimals.** Money and stock are `numeric` / Prisma `Decimal`. No JS `number` math on them.
5. **No hard deletes** of business data — archive or deactivate.
6. **Migrations** are created with `prisma migrate dev` and committed. Never `prisma db push`, never edit a committed migration, never `migrate deploy` (CI only). `migrate reset` only against the local Docker DB, and only after asking.
7. **Local only.** Never connect to staging or production, never read or write real env files for them, never put secrets in code. Only `.env.example` is committed.
8. **Scope.** Don't build Phase 2+ features (JWT login, permission enforcement, payments, combos, offers, reservations, notifications, offline replay). Keep the seams described in ARCHITECTURE §1.

## How to work

- Work one ticket at a time with `/ticket <ID>` (e.g. `/ticket B701`). One ticket = one branch = one PR.
- TDD: write the failing tests from the acceptance criteria first, then implement.
- Branches `feat/<ticket>-<short-name>` (or `fix/`, `chore/`); Conventional Commits, e.g. `feat(inventory): add ledger deduction service [B701]`.
- Ask before `git push`, installing new dependencies, or changing anything in `.github/`.
- Tickets marked 👤 or 🤝 in TASKS.md need account access you don't have: prepare the files and a checklist, then hand over.

## Project conventions (confirmed in B101)

- One folder per module under `src/modules/`; shared code in `src/common/`; Prisma in `src/prisma/` and `prisma/`; unit tests (`*.spec.ts`) beside the code; integration tests in `test/`.
- App-wide setup (prefix, pipes, filters) lives in `configureApp()` in `src/app.setup.ts`, used by both `main.ts` and the e2e tests, so tests boot the same app production runs.
- class-validator DTOs with a global `ValidationPipe`; routes under `/v1`.
- OpenAPI (ADR 0012) is the contract with the Angular app:
  - `@ApiProperty` on every DTO property.
  - `@ApiTags`, `@ApiOperation` and an `@Api…Response({ type })` on every route.
  - Controller method names are the `operationId`s, so they must be unique and readable (e.g. `listMenuItems`).
  - Never hand-edit `openapi.json`.
- Tenant routes: controllers under `:tenantSlug/...` with `@TenantRoute()`; staff-only unless `@AllowGuest()`, narrowed by `@Roles(...)`. Services inject `TENANT_DB` (never `PrismaService`; ESLint enforces it), pass `tenantId` from the context on creates, and await queries inside the request. Every new tenant route adds a case to `ISOLATION_CASES` in `test/tenant-isolation.e2e-spec.ts` (ADR 0018).
- Decimals on the wire: DTO fields are strings validated with `@IsDecimalString(MONEY | QUANTITY | COST)`; responses use `formatDecimal` (ADR 0013). Feature code builds Decimals with `parseDecimal`, never `new Prisma.Decimal` (ESLint forbids the runtime client import in `src/modules/**`).
- Stock: only `LedgerService` (`src/modules/inventory`) changes `currentStock`, always inside the caller's transaction (`deductOrder`, `recordWaste`, `recordPurchase`; ADR 0020, ADR 0021). `single-writer.spec.ts` fails on any other writer.
- Thin controllers; business rules in services; calculations (expected stock, reconciliation gap, anomalies) as pure functions with unit tests.
- One error shape everywhere: `{ code, message, details }`, no stack traces. Expected failures throw `AppException(status, 'STABLE_CODE', message, details)` from `src/common/errors/`; anything else becomes a logged, generic 500 `INTERNAL_ERROR`.
- Config comes from `loadConfig()` (`src/config/app-config.ts`, fail fast, all problems listed) and is injected with `@Inject(APP_CONFIG)`. Never read `process.env` in feature code.
- Logs: inject `PinoLogger` (`nestjs-pino`); every line carries the request id (`x-request-id`, echoed to the client). Never log secrets or whole request bodies.
