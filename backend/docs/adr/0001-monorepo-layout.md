# ADR 0001 — Monorepo with the API in `backend/`

- **Status:** accepted
- **Date:** 2026-11-06
- **Answers:** ARCHITECTURE §10 Q1 · **Tickets:** B101, B302, B401, B502, B1301

## Context

ROADMAP B101 asks us to decide between a separate `tablz-api` repo and a monorepo with the Angular app. The repository already has a monorepo shape: `frontend/` (Angular), `backend/` (an Express + Mongo stub that the roadmap replaces with NestJS + Prisma + Postgres), and shared root tooling (Husky, commitlint, lint-staged, PR template, CODEOWNERS, one CI workflow that today only runs frontend jobs). B302, B401, B502 and B1301 need to read frontend models, seed data and mock handlers.

## Options considered

1. **Monorepo, API in `backend/`** — replace the stub in place; one repo, shared tooling; add a backend CI job. Cost: one workflow and one set of branch-protection rules cover both apps. Risk: required checks must cope with path-filtered jobs.
2. **Monorepo + npm workspaces + `packages/shared`** — as 1, plus a shared TypeScript types package. Strongest drift protection, but extra tooling now and overlaps with the OpenAPI contract from B502.
3. **Separate `tablz-api` repo** — clean isolation and independent CI/deploys; duplicated tooling, and frontend references need `--add-dir`.

## Decision

Option 1. The NestJS API replaces the Express stub in `backend/`. The Claude Code kit (`CLAUDE.md`, `.claude/`, `docs/`) lives in `backend/`, and Claude Code is started from `backend/` for backend tickets.

## Consequences

- `backend/` is the API project root: its own `package.json`, `package-lock.json`, `tsconfig`, Prisma folder and tests. The Express/Mongo stub (and its dependencies) is removed in B101.
- Repo-level tooling stays at the root: Husky, commitlint, lint-staged, PR template, CODEOWNERS. lint-staged gains backend globs. `.github/workflows/ci.yml` gains a `backend` job with its own Postgres service container.
- Hooks in `backend/.claude/settings.json` use `$CLAUDE_PROJECT_DIR`, so they only run when Claude Code starts in `backend/`. For tickets that read the frontend (B302, B401, B502, B1301), start with `--add-dir ../frontend`.
- Type sharing is through the OpenAPI spec (B502), not a shared package. Revisit option 2 if drift appears in B302's model mapping or B1301.
- Branch protection and coverage gates apply to the whole repo; backend checks are required on PRs that touch `backend/`.
