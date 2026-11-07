import type { Prisma } from '../../generated/prisma/client';

type Decimal = Prisma.Decimal;

/**
 * The cached `branch_stock.current_stock` disagrees with the ledger (snapshot + rows since). That
 * is a broken invariant (rule 3), not a stock gap: refuse rather than hide it in an ADJUSTMENT.
 */
export class StockCacheMismatchError extends Error {
  constructor(
    readonly expected: Decimal,
    readonly currentStock: Decimal,
  ) {
    super(
      `current_stock ${currentStock.toFixed()} does not match the ledger's expected ${expected.toFixed()}`,
    );
    this.name = 'StockCacheMismatchError';
  }
}

export interface CountResult {
  /** counted − expected, in the stock unit. Negative = missing, positive = surplus. */
  gap: Decimal;
  /** True when the gap is not zero: an ADJUSTMENT row is needed. */
  flagged: boolean;
}

/**
 * ARCHITECTURE §5: the unexplained difference of a physical count. `expected` already includes
 * every logged waste row, so waste never enters the gap. Adding the gap to `currentStock` makes
 * it equal to the count, which is why the two must agree first.
 */
export function reconcileCount(input: {
  counted: Decimal;
  expected: Decimal;
  currentStock: Decimal;
}): CountResult {
  if (!input.currentStock.equals(input.expected)) {
    throw new StockCacheMismatchError(input.expected, input.currentStock);
  }
  const gap = input.counted.minus(input.expected);
  return { gap, flagged: !gap.isZero() };
}
