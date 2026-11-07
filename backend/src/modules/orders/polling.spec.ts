import { etagFor, lastStage, matchesIfNoneMatch } from './polling';

// B802: an unchanged poll must be answered with 304 from a cheap fingerprint of what the response
// would contain. These pin the fingerprint and the If-None-Match comparison (RFC 9110 §13.1.2).

const T1 = new Date('2026-11-06T10:00:00.000Z');
const T2 = new Date('2026-11-06T10:00:00.001Z');

describe('etagFor', () => {
  const base = { scope: 'list:tenant-a:branch-1:active:', count: 3, latest: T1 };

  it('is a weak, quoted tag that is stable for the same input', () => {
    const tag = etagFor(base);
    expect(tag).toMatch(/^W\/"[0-9a-f]{32}"$/);
    expect(etagFor({ ...base })).toBe(tag);
  });

  it('changes when the count, the latest change or the scope changes', () => {
    const tag = etagFor(base);
    expect(etagFor({ ...base, count: 4 })).not.toBe(tag);
    expect(etagFor({ ...base, latest: T2 })).not.toBe(tag);
    expect(etagFor({ ...base, scope: 'list:tenant-a:branch-1:all:' })).not.toBe(tag);
    expect(etagFor({ ...base, scope: 'list:tenant-b:branch-1:active:' })).not.toBe(tag);
  });

  it('handles an empty result', () => {
    expect(etagFor({ ...base, count: 0, latest: null })).toMatch(/^W\/"[0-9a-f]{32}"$/);
    expect(etagFor({ ...base, count: 0, latest: null })).not.toBe(tag0());
    function tag0(): string {
      return etagFor({ ...base, count: 0, latest: T1 });
    }
  });

  it('can fold in extra parts (e.g. the workflow stages for tracking)', () => {
    expect(etagFor({ ...base, extra: ['stages:2'] })).not.toBe(etagFor(base));
  });
});

describe('matchesIfNoneMatch (weak comparison)', () => {
  const tag = 'W/"abc"';

  it.each([
    ['the same weak tag', 'W/"abc"', true],
    ['the strong form of the same tag', '"abc"', true],
    ['one of a list', '"zzz", W/"abc" ,"yyy"', true],
    ['any (*)', '*', true],
    ['another tag', 'W/"abd"', false],
    ['an unquoted value', 'abc', false],
    ['nothing', undefined, false],
    ['an empty header', '', false],
  ] as const)('%s → %s', (_case, header, expected) => {
    expect(matchesIfNoneMatch(header, tag)).toBe(expected);
  });
});

describe('lastStage (position only, never a key)', () => {
  it('is the stage with the highest position', () => {
    const stages = [
      { key: 'b', position: 30 },
      { key: 'a', position: 50 },
      { key: 'c', position: 10 },
    ];
    expect(lastStage(stages)?.key).toBe('a');
  });

  it('is undefined for an empty workflow', () => {
    expect(lastStage([])).toBeUndefined();
  });
});
