import type { Prisma } from '../../generated/prisma/client';
import { parseDecimal } from '../../common/decimal/decimal';
import type { StockMathError } from './stock-math';
import { costPerStockUnit, derivedStock, isServable, stockStatus } from './stock-math';

// B702 stock view rules as pure functions: status (ADR 0006 negative flag), MIXED derived stock
// (ADR 0002), customer menu availability (one serving), and restock cost conversion (ADR 0003).

type Decimal = Prisma.Decimal;
const D = (v: string): Decimal => parseDecimal(v);

describe('stockStatus', () => {
  it.each([
    ['-0.001', null, 'negative'],
    ['-5', '2', 'negative'],
    ['0', null, 'out-of-stock'],
    ['0', '2', 'out-of-stock'],
    ['1.999', '2', 'low-stock'],
    ['2', '2', 'in-stock'],
    ['0.001', null, 'in-stock'],
    ['100', '2', 'in-stock'],
  ] as const)('%s with threshold %s → %s', (stock, threshold, expected) => {
    expect(stockStatus(D(stock), threshold === null ? null : D(threshold))).toBe(expected);
  });
});

describe('derivedStock (ADR 0002: min of component stock / quantity per unit)', () => {
  it('is limited by the scarcest component, truncated to 3 decimals', () => {
    const result = derivedStock([
      { inventoryItemId: 'tomatoes', stock: D('12'), perUnit: D('1.2') }, // 10
      { inventoryItemId: 'garlic', stock: D('0.1'), perUnit: D('0.025') }, // 4
      { inventoryItemId: 'oil', stock: D('1'), perUnit: D('0.3') }, // 3.3333…
    ]);
    expect([result.quantity.toFixed(3), result.limitingItemId]).toEqual(['3.333', 'oil']);
  });

  it('never goes below zero, even with a negative component', () => {
    const result = derivedStock([
      { inventoryItemId: 'a', stock: D('-2'), perUnit: D('1') },
      { inventoryItemId: 'b', stock: D('5'), perUnit: D('1') },
    ]);
    expect([result.quantity.toFixed(3), result.limitingItemId]).toEqual(['0.000', 'a']);
  });

  it('is zero with no components', () => {
    expect(derivedStock([])).toEqual({ quantity: D('0'), limitingItemId: null });
  });
});

describe('isServable (customer menu availability)', () => {
  const stock = new Map([
    ['beef', D('0.150')],
    ['buns', D('3')],
  ]);

  it('is true when every needed item covers one serving', () => {
    expect(
      isServable(
        new Map([
          ['beef', D('0.15')],
          ['buns', D('1')],
        ]),
        stock,
      ),
    ).toBe(true);
    expect(isServable(new Map(), stock)).toBe(true);
  });

  it('is false when any needed item is short, or has no stock row', () => {
    expect(isServable(new Map([['beef', D('0.151')]]), stock)).toBe(false);
    expect(isServable(new Map([['cheese', D('0.01')]]), stock)).toBe(false);
  });
});

describe('costPerStockUnit (ADR 0003/0005: entered per input unit, stored per stock unit)', () => {
  it.each([
    ['0.42', 'G', 'KG', '420'],
    ['420', 'KG', 'KG', '420'],
    ['85', 'L', 'L', '85'],
    ['0.085', 'ML', 'L', '85'],
    ['4500', 'KG', 'G', '4.5'],
  ] as const)('%s per %s = %s per %s', (cost, entered, stockUnit, expected) => {
    expect(costPerStockUnit(D(cost), entered, stockUnit).toString()).toBe(expected);
  });

  it('refuses a cost that needs more than 4 decimals per stock unit (ADR 0013)', () => {
    expect(() => costPerStockUnit(D('0.01'), 'KG', 'G')).toThrow(
      expect.objectContaining({ code: 'COST_TOO_PRECISE' }) as StockMathError,
    );
  });

  it('refuses a cost too large for numeric(14,4)', () => {
    expect(() => costPerStockUnit(D('99999999'), 'G', 'KG')).toThrow(
      expect.objectContaining({ code: 'COST_TOO_LARGE' }) as StockMathError,
    );
  });
});
