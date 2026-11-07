# ADR 0018 — Tenant route access defaults and rate limiting

- **Status:** accepted
- **Date:** 2026-11-06
- **Answers:** — · **Tickets:** B503, every later endpoint ticket

## Context

B503 builds the request pipeline of ARCHITECTURE §3: one swappable context provider (ADR 0007), a role guard, a tenant-scoped Prisma client, demo-only writes and rate limiting. Several defaults were not fixed by earlier decisions, and every later endpoint inherits them.

## Decision

- **Staff-only by default.** A `/v1/:tenantSlug/...` route without decorators needs a role (`401 AUTH_REQUIRED` for a guest). `@AllowGuest()` opens it to guests; `@Roles(...)` narrows it (`403 ROLE_FORBIDDEN`); ADMIN always passes.
- **One guard, fixed order.** `TenantAccessGuard` resolves the context, then checks roles, then refuses writes (anything but GET/HEAD/OPTIONS) on a tenant that is not `is_demo` (`403 DEMO_READ_ONLY`). The rate-limit guard runs before it.
- **Context for services.** The handler runs inside an `AsyncLocalStorage` context (`RequestContextStore`). `TENANT_DB` reads the tenant from it on every query and refuses to run without one, so a query awaited outside its request fails closed instead of running unscoped.
- **Scoped client rules.** Filters get `AND tenant_id = <tenant>`; creates get `tenant_id` (another tenant is refused); nested relation writes (`connect`, nested `create`, `set`, …) are refused, because a nested connect writes `tenant_id` onto the child; `delete`/`deleteMany` are refused (rule 5); unknown operations are refused; `tenants` is read-only and scoped by id; `app_environment` is off limits. Raw SQL is not scoped (ADR 0015), and ESLint forbids `$queryRaw`/`$executeRaw` in `src/modules/**`. Feature code passes `tenantId` on creates for Prisma's types; the extension is the safety net. ESLint forbids `src/modules/**` from importing `PrismaService` or constructing a `PrismaClient`.
- **Rate limiting.** `@nestjs/throttler`, in memory, per client IP: `RATE_LIMIT_MAX` requests (default 120) per `RATE_LIMIT_WINDOW_SECONDS` (default 60). Over the limit: `429 RATE_LIMITED` with `retryAfterSeconds` and a `Retry-After` header. Health routes are exempt so keep-alive pings never fail. On staging/production Express trusts one proxy hop (the host, Vercel; ADR 0028), so the limit sees the client's IP; locally no proxy is trusted.
- **`GET /v1/:tenantSlug/context`** returns the resolved tenant, branch and actor, for the Angular role picker and for the isolation suite.

## Consequences

- Every new tenant route must add an entry to `ISOLATION_CASES` in `test/tenant-isolation.e2e-spec.ts`; the suite fails when a route in `openapi.json` has none.
- In-memory limits reset on restart and are per instance. On Vercel there is usually more than one function instance, each counting on its own (ADR 0028), so the limit is approximate. A shared store (e.g. Redis) would make it exact.
- Phase 2 (JWT) replaces the `REQUEST_CONTEXT_PROVIDER` binding in `ContextModule` and deletes `src/context/dev-headers.ts` with its CORS and OpenAPI entries; the guard, the store and `TENANT_DB` stay.
- Related rows are written with their own scoped queries (e.g. order items with `createMany` in the same transaction), never as nested writes.
- `/v1/health/db` gives up after 3 s, but the query keeps its pool connection until Postgres answers. If keep-alive pings ever pile up against a hung database, add a `statement_timeout` (B1203 checklist).
