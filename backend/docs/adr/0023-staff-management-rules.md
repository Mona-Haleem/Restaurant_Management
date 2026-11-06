# ADR 0023 — Staff management rules

- **Status:** accepted
- **Date:** 2026-11-06
- **Answers:** — (ADR 0004 "confirm in B503/B1001") · **Tickets:** B1001

## Context

B1001 builds list, create, deactivate and role assignment for staff, with argon2 password hashes and no login. Open points:

- ARCHITECTURE §3 gives MANAGER "everything within their branch"; PRD §8.3 and §14.2 say a manager creates and deactivates *workers*.
- The Phase 1 role picker (`x-dev-role`, ADR 0007) selects the tenant's active `is_demo` user per role. Deactivating one, or changing its role, breaks the picker for that role.
- Nothing said whether someone may deactivate themselves.
- "Deactivated staff … are excluded from role/order assignment, but stay visible for history" (PRD §14.2).

## Options considered

1. **Manager = admin for staff.** Simple, but a manager could create admins: too broad.
2. **Manager manages workers of their own branch only; admin manages everyone.** Matches PRD §8.3 and the branch limit of ARCHITECTURE §3.
3. **Manager manages any non-admin of their branch.** Lets managers create or demote other managers.

## Decision

Option 2, decided by the user on 2026-11-06:

- **ADMIN** sees and manages all staff of the tenant. **MANAGER** sees the staff of their own branch only (others are `404 STAFF_NOT_FOUND`). A manager may create, edit, deactivate and reactivate **WORKERs** of that branch only; anything else is `403 STAFF_FORBIDDEN` (creating a MANAGER/ADMIN, promoting, moving to another branch, editing a manager). WORKER and guests have no access (route guard).
- **Branch:** ADMIN has none (`400 BRANCH_NOT_ALLOWED` if one is sent); becoming ADMIN drops the branch. MANAGER/WORKER need an active branch of the tenant (`400 BRANCH_REQUIRED` / `400 BRANCH_NOT_FOUND`), defaulting to the caller's branch.
- **Protected accounts:** demo users cannot be deactivated or change role (`409 DEMO_USER_PROTECTED`); they may be renamed. Nobody can deactivate themselves (`409 CANNOT_DEACTIVATE_SELF`).
- **Never delete.** Deactivation sets `is_active = false`; the row and its name stay, so orders, stage history and ledger rows keep resolving to the person. `GET /staff?status=ACTIVE` is the list for pickers; the default list includes inactive staff. Inactive users are already refused as `x-dev-user` (B503).
- **Passwords:** required on create (8–128 characters), stored as argon2id (`argon2` package, library defaults), never returned. No login or password change until Phase 2.
- **Emails:** optional, trimmed and lowercased, unique per tenant (`409 STAFF_EMAIL_TAKEN`).
- **Concurrent edits:** an edit writes only the fields that changed, guarded by the role, branch and active flag its rules were checked against. If another edit changed them meanwhile, it fails with `409 STAFF_CHANGED` instead of applying stale rules. Moving or reactivating someone needs an active branch.
- `role_permissions` / `user_permission_overrides` stay unenforced (ARCHITECTURE §1).

The rules are a pure function (`src/modules/staff/staff-rules.ts`) with unit tests.

## Consequences

- No migration: the `users` table and its ADMIN-has-no-branch CHECK came with B301.
- Emails are compared lowercase only through the API. The seed already stores lowercase. A case-insensitive unique index can come later if rows get written another way.
- B802 (board/tracking) should show `placed_by`/history actor names through a join on `users`, without filtering on `is_active`. Add an API-level test there for a deactivated worker's order.
- Phase 2: login verifies with `argon2.verify`. Detailed permissions may widen what a manager can do (PRD §7.1 detailed mode).
