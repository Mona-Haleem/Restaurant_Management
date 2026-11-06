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

export class UnitDimensionError extends Error {
  constructor(from: Unit, to: Unit) {
    super(`UNIT_DIMENSION_MISMATCH: cannot convert ${from} to ${to}`);
    this.name = 'UnitDimensionError';
  }
}

export function sameDimension(a: Unit, b: Unit): boolean {
  return UNITS[a].dimension === UNITS[b].dimension;
}

/**
 * Converts a quantity between units of one dimension (ADR 0003). Exact, because every factor is
 * a power of ten. The ledger always stores the item's stock unit, so inputs convert at the edge.
 */
export function convertQuantity(quantity: Decimal, from: Unit, to: Unit): Decimal {
  if (!sameDimension(from, to)) throw new UnitDimensionError(from, to);
  return quantity.times(UNITS[from].factor).dividedBy(UNITS[to].factor);
}
