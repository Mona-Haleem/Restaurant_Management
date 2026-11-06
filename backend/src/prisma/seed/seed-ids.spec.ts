import { createHash } from 'node:crypto';
import { demoTrackingToken, hashTrackingToken, seedId } from './seed-ids';

describe('seedId', () => {
  it('returns a version 5 uuid', () => {
    expect(seedId('nile-bites', 'orders', 'o1')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('is stable for the same parts and different for different parts', () => {
    expect(seedId('a', 'b')).toBe(seedId('a', 'b'));
    expect(seedId('a', 'b')).not.toBe(seedId('a', 'c'));
    expect(seedId('ab', 'c')).not.toBe(seedId('a', 'bc'));
  });
});

describe('demo tracking tokens (ADR 0008 shape)', () => {
  it('are 32 bytes in base64url, stable per order', () => {
    const token = demoTrackingToken('nile-bites', 'o1');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(demoTrackingToken('nile-bites', 'o1')).toBe(token);
    expect(demoTrackingToken('nile-bites', 'o2')).not.toBe(token);
  });

  it('are stored as the sha256 hex of the token', () => {
    expect(hashTrackingToken('abc')).toBe(createHash('sha256').update('abc').digest('hex'));
  });
});
