import { createHash } from 'node:crypto';

/** Fixed namespace for seed ids, so the same seed row always gets the same uuid. */
const NAMESPACE = Buffer.from('6f1d8a2e4b7c4e0f9a3b5c7d9e1f2a4b', 'hex');

/**
 * A name-based (version 5) uuid from the given parts, e.g. `seedId('nile-bites', 'orders', 'o1')`.
 * Deterministic ids are what make the seed idempotent: a second run finds every row by its id.
 */
export function seedId(...parts: string[]): string {
  const name = parts.map((p) => `${p.length}:${p}`).join('|');
  const bytes = createHash('sha1').update(NAMESPACE).update(name).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The tracking token of a seeded guest order: 32 bytes, base64url, like ADR 0008's real tokens,
 * but derived from the order key so demos and tests can open the tracking page. Demo data only:
 * real tokens come from `crypto.randomBytes` and are never derivable.
 */
export function demoTrackingToken(tenantSlug: string, orderKey: string): string {
  return createHash('sha256')
    .update(`tablz-demo-tracking:${tenantSlug}:${orderKey}`)
    .digest()
    .toString('base64url');
}

/** What `orders.tracking_token_hash` stores (ADR 0008). */
export function hashTrackingToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
