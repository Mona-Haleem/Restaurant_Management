/**
 * Phase 1 identity headers (ADR 0007), read only by DevHeaderContextProvider. Phase 2 (JWT)
 * deletes this file together with its CORS and OpenAPI entries (app.setup.ts, @TenantRoute).
 */
export const DEV_HEADERS = {
  role: 'x-dev-role',
  user: 'x-dev-user',
  branch: 'x-dev-branch',
} as const;
