/** Supertest types `body` as `any`; read it as `unknown` so assertions stay type-safe. */
export function bodyOf(response: { body: unknown }): unknown {
  return response.body;
}
