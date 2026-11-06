import { createHash } from 'node:crypto';
import { hashTrackingToken, newTrackingToken, TrackingTokenPipe } from './tracking-token';

describe('tracking token (ADR 0008)', () => {
  it('is 32 random bytes, base64url, and stored only as its sha256 hex', () => {
    const { token, hash } = newTrackingToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(hashTrackingToken(token)).toBe(hash);
  });

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newTrackingToken().token));
    expect(tokens.size).toBe(200);
  });
});

describe('TrackingTokenPipe', () => {
  const pipe = new TrackingTokenPipe();

  it('passes a well-formed token through', () => {
    const { token } = newTrackingToken();
    expect(pipe.transform(token)).toBe(token);
  });

  it.each(['', 'short', 'x'.repeat(44), `${'x'.repeat(42)}!`, `${'x'.repeat(42)}/`])(
    'answers a malformed token (%p) like an unknown one',
    (value) => {
      expect(() => pipe.transform(value)).toThrow(
        expect.objectContaining({ code: 'ORDER_NOT_FOUND' }) as Error,
      );
    },
  );
});
