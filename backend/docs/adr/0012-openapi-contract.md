# ADR 0012 — OpenAPI contract: committed spec, drift test, client later

- **Status:** accepted
- **Date:** 2026-11-06
- **Answers:** — · **Tickets:** B502, B1301

## Context

B502 asks for a generated OpenAPI spec, a typed Angular client generated from it, and a contract test proving the frontend's mock handlers match the spec. When B502 was worked, the frontend had none of TABLZ-401 (models), TABLZ-402 (mock server) or TABLZ-403 (service layer), and the API had no feature routes yet (they start in B601).

## Options considered

1. **Wait** until the frontend tickets exist. The spec infrastructure would then arrive after B601+, when routes have already been written without a contract check.
2. **Backend half now, frontend half later.** The spec is generated from decorators and committed, with a test that fails on drift. Client generation and the mock contract test become a follow-up once TABLZ-401/402 exist.
3. **Build TABLZ-401–403 as part of B502.** This is frontend scope with its own decisions (MSW or JSON Server, the state layer).

## Decision

Option 2.

- **Spec:** `SwaggerModule` builds the spec from decorators.
  - Committed as `backend/openapi.json`.
  - Regenerated with `npm run openapi:generate`.
  - `src/openapi/openapi.spec.ts` fails when the code and the file differ. It runs in `npm test`, the pre-commit hook and CI, so a changed response field cannot merge without the contract changing visibly in the diff.
- **Documentation rules:**
  - Every route is under `/v1` and has a tag, an `operationId` (the method name, which becomes the generated client's method) and a 2xx response.
  - Every operation's `default` response is the shared `ErrorResponse` schema (`{ code, message, details }`), added automatically.
- **Serving:** `/v1/openapi.json` is served in every environment, since it is the public contract. The Swagger UI at `/v1/docs` is served everywhere except production.

## Consequences

- Every DTO property needs `@ApiProperty` and every route needs `@ApiTags`, an `@Api…Response` and a unique method name. The OpenAPI spec test enforces the tag, response and `operationId` rules.
- **B502 follow-up** (after TABLZ-401/402):
  - Generate the Angular client from `backend/openapi.json` into `frontend/`.
  - Add a contract test that validates the mock handlers' requests and responses against the spec.
  - Without these, the frontend side of B502's acceptance ("changing a response field breaks the contract test before it can break the frontend") is not met.
- The ARCHITECTURE §7 decision that decimals are serialized as strings is still pending B302's numeric-precision ADR. The spec doesn't claim it yet.
