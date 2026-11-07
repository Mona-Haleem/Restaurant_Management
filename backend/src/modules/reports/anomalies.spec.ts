import { parseDecimal } from '../../common/decimal/decimal';
import { checkDeduction } from './anomalies';

// B1101: a delivered order's CONSUMPTION rows versus what its recipe expects. Pure: the service
// passes per-item totals (both positive, in the stock unit) from its queries.

const D = parseDecimal;
const ITEMS = new Map([
  ['cheese', { name: 'Mozzarella', unit: 'KG' as const }],
  ['beef', { name: 'Beef Mince', unit: 'KG' as const }],
  ['garlic', { name: 'Garlic', unit: 'KG' as const }],
  ['buns', { name: 'Brioche Buns', unit: 'PCS' as const }],
]);
const describeItem = (id: string) => ITEMS.get(id)!;
const map = (entries: [string, string][]) => new Map(entries.map(([k, v]) => [k, D(v)]));

describe('checkDeduction', () => {
  it('flags nothing for a deduction that matches the recipe', () => {
    const expected = map([
      ['cheese', '0.150'],
      ['buns', '2'],
    ]);
    expect(
      checkDeduction(
        {
          expected,
          actual: map([
            ['cheese', '0.15'],
            ['buns', '2'],
          ]),
        },
        describeItem,
      ),
    ).toEqual([]);
  });

  it('flags a constructed bad deduction with a readable reason', () => {
    const flags = checkDeduction(
      { expected: map([['cheese', '0.150']]), actual: map([['cheese', '0.450']]) },
      describeItem,
    );
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ inventoryItemId: 'cheese', kind: 'OVER_DEDUCTED' });
    expect(flags[0]!.expected.toFixed(3)).toBe('0.150');
    expect(flags[0]!.actual.toFixed(3)).toBe('0.450');
    expect(flags[0]!.reason).toBe(
      'Mozzarella: deducted 3× the recipe expectation (0.450 KG instead of 0.150 KG).',
    );
  });

  it('flags an under-deduction', () => {
    const [flag] = checkDeduction(
      { expected: map([['beef', '0.300']]), actual: map([['beef', '0.150']]) },
      describeItem,
    );
    expect(flag).toMatchObject({ kind: 'UNDER_DEDUCTED' });
    expect(flag!.reason).toBe(
      'Beef Mince: deducted 0.5× the recipe expectation (0.150 KG instead of 0.300 KG).',
    );
  });

  it('flags an item the recipe does not use, and a recipe item that was not deducted', () => {
    const flags = checkDeduction(
      { expected: map([['beef', '0.150']]), actual: map([['garlic', '0.020']]) },
      describeItem,
    );
    expect(flags.map((f) => [f.inventoryItemId, f.kind, f.reason])).toEqual([
      [
        'beef',
        'NOT_DEDUCTED',
        'Beef Mince: the recipe expects 0.150 KG, but nothing was deducted.',
      ],
      ['garlic', 'NOT_IN_RECIPE', 'Garlic: deducted 0.020 KG, which the recipe does not use.'],
    ]);
  });

  it('ignores differences within 0.001 (the stock scale)', () => {
    expect(
      checkDeduction(
        { expected: map([['cheese', '0.1505']]), actual: map([['cheese', '0.151']]) },
        describeItem,
      ),
    ).toEqual([]);
  });

  it('flags a missing deduction for a whole order (no rows at all)', () => {
    const flags = checkDeduction(
      { expected: map([['buns', '2']]), actual: new Map() },
      describeItem,
    );
    expect(flags.map((f) => f.kind)).toEqual(['NOT_DEDUCTED']);
    expect(flags[0]!.reason).toBe(
      'Brioche Buns: the recipe expects 2.000 PCS, but nothing was deducted.',
    );
  });

  it('rounds the ratio to two decimals and sorts flags by item name', () => {
    const flags = checkDeduction(
      {
        expected: map([
          ['cheese', '0.300'],
          ['beef', '0.300'],
        ]),
        actual: map([
          ['cheese', '0.400'],
          ['beef', '0.100'],
        ]),
      },
      describeItem,
    );
    expect(flags.map((f) => f.inventoryItemId)).toEqual(['beef', 'cheese']);
    expect(flags[1]!.reason).toContain('deducted 1.33× the recipe expectation');
  });
});
