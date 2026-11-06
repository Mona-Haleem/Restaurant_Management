import type { Prisma } from '../../generated/prisma/client';
import { parseDecimal } from '../../common/decimal/decimal';

type Decimal = Prisma.Decimal;

export interface RequestedLine {
  menuItemId: string;
  quantity: number;
}

export interface PricedLine extends RequestedLine {
  name: string;
  unitPrice: Decimal;
  lineTotal: Decimal;
}

/**
 * Copies each menu item's name and price onto its line (ARCHITECTURE §4: menu edits never
 * rewrite history) and totals the order with Decimal math only (rule 4). Lines stay as sent.
 */
export function priceOrder(
  lines: readonly RequestedLine[],
  menu: ReadonlyMap<string, { name: string; price: Decimal }>,
): { lines: PricedLine[]; total: Decimal } {
  let total = parseDecimal('0');
  const priced = lines.map((line) => {
    const item = menu.get(line.menuItemId);
    if (!item) throw new Error(`Menu item ${line.menuItemId} was not loaded`);
    const lineTotal = item.price.times(line.quantity);
    total = total.plus(lineTotal);
    return { ...line, name: item.name, unitPrice: item.price, lineTotal };
  });
  return { lines: priced, total };
}
