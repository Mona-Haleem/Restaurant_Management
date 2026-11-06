import type { Prisma } from '../../generated/prisma/client';
import type { Unit } from '../../generated/prisma/enums';
import { COST, parseDecimal, QUANTITY, truncate } from '../../common/decimal/decimal';
import { convertQuantity } from '../../common/units/units';

/** B702 stock view rules, as pure functions (ADR 0021). */

type Decimal = Prisma.Decimal;

/** Values match the Angular app's INVENTORY_STATUS, plus `negative` (ADR 0006). */
export type StockStatus = 'negative' | 'out-of-stock' | 'low-stock' | 'in-stock' | 'derived';
export const STOCK_STATUSES: readonly StockStatus[] = [
  'negative',
  'out-of-stock',
  'low-stock',
  'in-stock',
  'derived',
];

export class StockMathError extends Error {
  constructor(
    readonly code: 'COST_TOO_PRECISE' | 'COST_TOO_LARGE',
    message: string,
  ) {
    super(message);
    this.name = 'StockMathError';
  }
}

/** Status of a RAW/READY item: below 0, exactly 0, below its threshold, or fine. */
export function stockStatus(stock: Decimal, lowStockThreshold: Decimal | null): StockStatus {
  if (stock.isNegative()) return 'negative';
  if (stock.isZero()) return 'out-of-stock';
  if (lowStockThreshold !== null && stock.lessThan(lowStockThreshold)) return 'low-stock';
  return 'in-stock';
}

export interface DerivedComponent {
  inventoryItemId: string;
  /** The component's stock in its own stock unit (0 when it has no stock row). */
  stock: Decimal;
  /** Component needed per one unit of the MIXED item, in the component's stock unit. */
  perUnit: Decimal;
}

/**
 * ADR 0002: a MIXED item's "available" figure = min(component stock / quantity per unit), in the
 * MIXED item's unit, truncated to 3 decimals and never below 0. Read-only, never stored.
 */
export function derivedStock(components: readonly DerivedComponent[]): {
  quantity: Decimal;
  limitingItemId: string | null;
} {
  let best: { quantity: Decimal; limitingItemId: string | null } = {
    quantity: parseDecimal('0'),
    limitingItemId: null,
  };
  components.forEach((c, index) => {
    const possible = c.stock.isNegative() ? parseDecimal('0') : c.stock.dividedBy(c.perUnit);
    if (index === 0 || possible.lessThan(best.quantity)) {
      best = { quantity: possible, limitingItemId: c.inventoryItemId };
    }
  });
  return { quantity: truncate(best.quantity, QUANTITY), limitingItemId: best.limitingItemId };
}

/** Customer menu: servable when every needed item has at least one serving's worth in stock. */
export function isServable(
  perServing: ReadonlyMap<string, Decimal>,
  stock: ReadonlyMap<string, Decimal>,
): boolean {
  for (const [itemId, needed] of perServing) {
    if ((stock.get(itemId) ?? parseDecimal('0')).lessThan(needed)) return false;
  }
  return true;
}

/**
 * A cost entered per `entered` unit, as a cost per stock unit (ADR 0003, ADR 0005): 0.42 per G is
 * 420 per KG. Refused, never rounded, when it does not fit numeric(14,4) (ADR 0013).
 */
export function costPerStockUnit(cost: Decimal, entered: Unit, stockUnit: Unit): Decimal {
  const perStockUnit = cost.times(convertQuantity(parseDecimal('1'), stockUnit, entered));
  if (perStockUnit.decimalPlaces() > COST.scale) {
    throw new StockMathError(
      'COST_TOO_PRECISE',
      `${perStockUnit.toString()} per ${stockUnit} needs more than ${COST.scale} decimals`,
    );
  }
  if (perStockUnit.truncated().toFixed(0).length > COST.integerDigits) {
    throw new StockMathError(
      'COST_TOO_LARGE',
      `${perStockUnit.toString()} per ${stockUnit} is too large`,
    );
  }
  return perStockUnit;
}
