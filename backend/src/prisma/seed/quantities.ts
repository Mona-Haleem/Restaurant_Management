import type { Prisma } from '../../generated/prisma/client';

type Decimal = Prisma.Decimal;

/** The seed converts units with the same function as the API (ADR 0003). */
export { convertQuantity as toStockUnit } from '../../common/units/units';

/** ADR 0013: a value with more decimals than its column is refused, never stored rounded. */
export function assertScale(value: Decimal, scale: number, label: string): Decimal {
  if (value.decimalPlaces() > scale) {
    throw new Error(`${label} = ${value.toString()} has more than ${scale} decimals`);
  }
  return value;
}
