import type { Prisma } from '../../generated/prisma/client';
import type { Unit } from '../../generated/prisma/enums';

type Decimal = Prisma.Decimal;

/** Each unit's dimension and its factor to the dimension's base unit (ADR 0003). */
const UNITS: Record<Unit, { dimension: 'mass' | 'volume' | 'count'; factor: string }> = {
  G: { dimension: 'mass', factor: '1' },
  KG: { dimension: 'mass', factor: '1000' },
  ML: { dimension: 'volume', factor: '1' },
  L: { dimension: 'volume', factor: '1000' },
  PCS: { dimension: 'count', factor: '1' },
};

/**
 * Converts a quantity into an item's stock unit. Exact, because every factor is a power of ten.
 * The seed's copy of the ADR 0003 conversion; B601/B701 own the service version.
 */
export function toStockUnit(quantity: Decimal, from: Unit, to: Unit): Decimal {
  if (UNITS[from].dimension !== UNITS[to].dimension) {
    throw new Error(`UNIT_DIMENSION_MISMATCH: cannot convert ${from} to ${to}`);
  }
  return quantity.times(UNITS[from].factor).dividedBy(UNITS[to].factor);
}

/** ADR 0013: a value with more decimals than its column is refused, never stored rounded. */
export function assertScale(value: Decimal, scale: number, label: string): Decimal {
  if (value.decimalPlaces() > scale) {
    throw new Error(`${label} = ${value.toString()} has more than ${scale} decimals`);
  }
  return value;
}
