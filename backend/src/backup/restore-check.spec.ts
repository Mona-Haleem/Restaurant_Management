import {
  assertRestoreDatabase,
  compareCounts,
  parseCounts,
  RESTORE_DATABASE,
} from './restore-check';

// B1204: a backup carries the exact row count of every table at dump time (counts.tsv). After a
// restore the counts are taken again and must match exactly: that is the drill's acceptance.

describe('parseCounts', () => {
  it('reads one "table<TAB>count" line per table', () => {
    const counts = parseCounts('orders\t12\nbranch_stock\t40\n_prisma_migrations\t4\n');
    expect([...counts]).toEqual([
      ['orders', 12n],
      ['branch_stock', 40n],
      ['_prisma_migrations', 4n],
    ]);
  });

  it('accepts Windows line endings and ignores blank lines', () => {
    expect([...parseCounts('orders\t1\r\n\r\nusers\t3\r\n')]).toEqual([
      ['orders', 1n],
      ['users', 3n],
    ]);
  });

  it.each([
    ['a line without a tab', 'orders 12'],
    ['a non-numeric count', 'orders\tmany'],
    ['a negative count', 'orders\t-1'],
    ['a table listed twice', 'orders\t1\norders\t2'],
    ['nothing at all', ''],
  ])('refuses %s', (_name, text) => {
    expect(() => parseCounts(text)).toThrow(/counts/i);
  });
});

describe('compareCounts', () => {
  const expected = parseCounts('orders\t12\nusers\t3\n');

  it('matches when every table has the same count', () => {
    const result = compareCounts(expected, parseCounts('users\t3\norders\t12\n'));
    expect(result.ok).toBe(true);
    expect(result.rows).toEqual([
      { table: 'orders', expected: 12n, actual: 12n, ok: true },
      { table: 'users', expected: 3n, actual: 3n, ok: true },
    ]);
  });

  it('fails on a different count, and says which table', () => {
    const result = compareCounts(expected, parseCounts('orders\t11\nusers\t3\n'));
    expect(result.ok).toBe(false);
    expect(result.rows.filter((r) => !r.ok)).toEqual([
      { table: 'orders', expected: 12n, actual: 11n, ok: false },
    ]);
  });

  it('fails on a table missing from the restore, or one the backup did not have', () => {
    const result = compareCounts(expected, parseCounts('orders\t12\nextra\t0\n'));
    expect(result.ok).toBe(false);
    expect(result.rows.filter((r) => !r.ok)).toEqual([
      { table: 'extra', expected: null, actual: 0n, ok: false },
      { table: 'users', expected: 3n, actual: null, ok: false },
    ]);
  });
});

describe('assertRestoreDatabase', () => {
  it('restores only into its own scratch database', () => {
    expect(RESTORE_DATABASE).toBe('tablz_restore');
    expect(() => assertRestoreDatabase('tablz_restore')).not.toThrow();
  });

  it.each(['tablz_dev', 'tablz_test', 'postgres', 'template1', ''])(
    'refuses %p (the restore drops and recreates its target)',
    (name) => {
      expect(() => assertRestoreDatabase(name)).toThrow(/tablz_restore/);
    },
  );
});
