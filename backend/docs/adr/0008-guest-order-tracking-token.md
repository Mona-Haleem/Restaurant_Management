# ADR 0008 — Guest order access by tracking token

- **Status:** accepted
- **Date:** 2026-11-06
- **Answers:** ARCHITECTURE §10 Q7 · **Tickets:** B301, B502, B503, B801, B802

## Context

Guests have no account (`placed_by_type = GUEST`, ARCHITECTURE §1) but may track and cancel their own order while its stage is `cancellable`. Order ids appear on the staff board, in logs and in shared URLs, so knowing an id must not grant control of the order.

## Options considered

1. **Tracking token returned at checkout** — random secret, stored hashed; guest routes take the token.
2. **Order id + short pickup code** — human-friendly, but short codes are guessable without strict rate limiting.
3. **Order id alone** — no extra work; anyone who sees an id can cancel.

## Decision

Option 1.

- Placing a guest order generates 32 random bytes (`crypto.randomBytes`), encoded base64url, returned **once** in the create response as `trackingToken`.
- `orders.tracking_token_hash` stores `sha256(token)` (hex), unique. The plain token is never stored or logged.
- Guest routes: `GET /v1/:tenantSlug/track/:token` (status and items) and `POST /v1/:tenantSlug/track/:token/cancel`. Lookup hashes the token and matches within the path's tenant. An unknown token → 404 `ORDER_NOT_FOUND` (no hint whether it exists elsewhere).
- Staff routes keep using order ids and the role guard; staff never need the token.

## Consequences

- **Schema (B301):** `orders.tracking_token_hash text NULL`, unique index. NULL for staff-placed orders.
- **Logging (B501):** request logging redacts the `:token` path segment.
- **Rate limiting (B503):** track routes share the global limiter; a stricter limit can be added if abuse shows up.
- **Polling (B802):** the tracking endpoint supports the same `updatedSince`/ETag rules as the board.
- **Frontend:** stores the token from the checkout response (e.g. in the confirmation URL or localStorage). A lost token means the guest asks staff.
- **Later:** the PRD's human pickup code (Phase 2) is a separate display field, not a credential. Customer accounts (Phase 2) access their orders through the JWT instead; the token stays for guests.
