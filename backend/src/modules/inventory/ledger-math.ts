import type { Prisma } from '../../generated/prisma/client';
import type { InventoryItemType, Unit } from '../../generated/prisma/enums';
import { COST, parseDecimal, QUANTITY, roundHalfUp } from '../../common/decimal/decimal';
import { convertQuantity, sameDimension } from '../../common/units/units';

/**
 * The ledger's arithmetic as pure functions (ARCHITECTURE §5). The ledger service and the demo
 * seed both use them, so what an order consumes and how costs average are decided in one place.
 */

type Decimal = Prisma.Decimal;

export interface StockItem {
  id: string;
  type: InventoryItemType;
  unit: Unit;
}

/** One recipe line of a menu item: quantity per one menu item, in `unit`. */
export interface RecipeLine {
  inventoryItemId: string;
  quantity: Decimal;
  unit: Unit;
}

/** One component of a MIXED item: quantity per one unit of the MIXED item, in `unit`. */
export interface ComponentLine {
  componentItemId: string;
  quantity: Decimal;
  unit: Unit;
}

export interface OrderLine {
  menuItemId: string;
  quantity: number;
}

export type LedgerMathCode =
  | 'INVENTORY_ITEM_NOT_FOUND'
  | 'MIXED_COMPONENT_IS_MIXED'
  | 'UNIT_DIMENSION_MISMATCH'
  | 'QUANTITY_TOO_PRECISE';

export class LedgerMathError extends Error {
  constructor(
    readonly code: LedgerMathCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'LedgerMathError';
  }
}

function inStockUnit(quantity: Decimal, from: Unit, item: StockItem): Decimal {
  if (!sameDimension(from, item.unit)) {
    throw new LedgerMathError('UNIT_DIMENSION_MISMATCH', `cannot convert ${from} to ${item.unit}`, {
      inventoryItemId: item.id,
    });
  }
  return convertQuantity(quantity, from, item.unit);
}

function fitsQuantity(value: Decimal, inventoryItemId: string): Decimal {
  if (value.decimalPlaces() > QUANTITY.scale) {
    throw new LedgerMathError(
      'QUANTITY_TOO_PRECISE',
      `${value.toString()} needs more than ${QUANTITY.scale} decimals`,
      { inventoryItemId },
    );
  }
  return value;
}

/**
 * What an order consumes, per RAW/READY item, in each item's stock unit (positive amounts).
 * MIXED ingredients expand one level into their components (ADR 0002); amounts are aggregated
 * per item, so the ledger writes one CONSUMPTION row per item per order (ARCHITECTURE §5).
 * Insertion order follows the order lines, recipe lines and components as given.
 */
export function expandOrder(
  lines: readonly OrderLine[],
  recipes: ReadonlyMap<string, readonly RecipeLine[]>,
  items: ReadonlyMap<string, StockItem>,
  components: ReadonlyMap<string, readonly ComponentLine[]>,
): Map<string, Decimal> {
  const itemOf = (id: string): StockItem => {
    const item = items.get(id);
    if (!item) {
      throw new LedgerMathError('INVENTORY_ITEM_NOT_FOUND', `unknown inventory item ${id}`, {
        inventoryItemId: id,
      });
    }
    return item;
  };
  const totals = new Map<string, Decimal>();
  const add = (id: string, amount: Decimal): void => {
    totals.set(id, (totals.get(id) ?? parseDecimal('0')).plus(amount));
  };

  for (const orderLine of lines) {
    for (const recipeLine of recipes.get(orderLine.menuItemId) ?? []) {
      const item = itemOf(recipeLine.inventoryItemId);
      const perMenuItem = inStockUnit(recipeLine.quantity, recipeLine.unit, item);
      if (item.type !== 'MIXED') {
        add(item.id, fitsQuantity(perMenuItem, item.id).times(orderLine.quantity));
        continue;
      }
      for (const c of components.get(item.id) ?? []) {
        const part = itemOf(c.componentItemId);
        if (part.type === 'MIXED') {
          throw new LedgerMathError(
            'MIXED_COMPONENT_IS_MIXED',
            `MIXED item ${item.id} has a MIXED component ${part.id}`,
            { mixedItemId: item.id, inventoryItemId: part.id },
          );
        }
        const perUnit = inStockUnit(c.quantity, c.unit, part);
        add(part.id, fitsQuantity(perUnit.times(perMenuItem), part.id).times(orderLine.quantity));
      }
    }
  }
  for (const [id, total] of totals) fitsQuantity(total, id);
  return totals;
}

/**
 * ADR 0005: weighted moving average after a purchase of `quantity` at `unitCost`. When stock on
 * hand is zero or negative, or there is no average yet, the purchase cost becomes the average.
 * Rounded half-up to numeric(14,4), the only rounding the ledger does (ADR 0013).
 */
export function nextAverageCost(
  stock: Decimal,
  average: Decimal | null,
  quantity: Decimal,
  unitCost: Decimal,
): Decimal {
  if (!stock.isPositive() || stock.isZero() || average === null) return unitCost;
  return roundHalfUp(
    stock.times(average).plus(quantity.times(unitCost)).dividedBy(stock.plus(quantity)),
    COST,
  );
}

/** ARCHITECTURE §5: expected stock = latest snapshot (or 0) + every delta written after it. */
export function expectedStock(
  snapshotQuantity: Decimal | null,
  deltasSince: readonly Decimal[],
): Decimal {
  return deltasSince.reduce((sum, delta) => sum.plus(delta), snapshotQuantity ?? parseDecimal('0'));
}
