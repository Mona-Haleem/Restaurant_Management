import type { Prisma } from '../../generated/prisma/client';
import type { Unit } from '../../generated/prisma/enums';
import { formatDecimal, parseDecimal, QUANTITY } from '../../common/decimal/decimal';

type Decimal = Prisma.Decimal;

export type AnomalyKind = 'OVER_DEDUCTED' | 'UNDER_DEDUCTED' | 'NOT_IN_RECIPE' | 'NOT_DEDUCTED';

export interface DeductionAnomaly {
  inventoryItemId: string;
  kind: AnomalyKind;
  /** What the recipe expects, in the stock unit (0 when the recipe does not use the item). */
  expected: Decimal;
  /** What was deducted, in the stock unit. */
  actual: Decimal;
  /** For people: shown when a flagged row is expanded (PRD Reports). */
  reason: string;
}

/** Smaller differences are rounding at the stock scale (numeric(14,3)), not anomalies. */
const TOLERANCE = parseDecimal('0.001');

/**
 * Compares one delivered order's deduction with its recipe expectation (ROADMAP B1101). Both maps
 * hold positive totals per inventory item in its stock unit: `expected` from `expandOrder`,
 * `actual` from the order's CONSUMPTION rows. Returns one flag per item that differs by more than
 * the tolerance, sorted by item name.
 */
export function checkDeduction(
  input: { expected: ReadonlyMap<string, Decimal>; actual: ReadonlyMap<string, Decimal> },
  describeItem: (inventoryItemId: string) => { name: string; unit: Unit },
): DeductionAnomaly[] {
  const zero = parseDecimal('0');
  const ids = new Set([...input.expected.keys(), ...input.actual.keys()]);
  const flags: (DeductionAnomaly & { name: string })[] = [];
  for (const id of ids) {
    const expected = input.expected.get(id) ?? zero;
    const actual = input.actual.get(id) ?? zero;
    if (actual.minus(expected).abs().lessThanOrEqualTo(TOLERANCE)) continue;
    const { name, unit } = describeItem(id);
    const amount = (q: Decimal): string => `${formatDecimal(q, QUANTITY)} ${unit}`;
    let kind: AnomalyKind;
    let reason: string;
    if (expected.isZero()) {
      kind = 'NOT_IN_RECIPE';
      reason = `${name}: deducted ${amount(actual)}, which the recipe does not use.`;
    } else if (actual.isZero()) {
      kind = 'NOT_DEDUCTED';
      reason = `${name}: the recipe expects ${amount(expected)}, but nothing was deducted.`;
    } else {
      kind = actual.greaterThan(expected) ? 'OVER_DEDUCTED' : 'UNDER_DEDUCTED';
      const ratio = actual.dividedBy(expected).toDecimalPlaces(2).toString();
      reason =
        `${name}: deducted ${ratio}× the recipe expectation ` +
        `(${amount(actual)} instead of ${amount(expected)}).`;
    }
    flags.push({ inventoryItemId: id, kind, expected, actual, reason, name });
  }
  return flags
    .sort(
      (a, b) => a.name.localeCompare(b.name) || (a.inventoryItemId < b.inventoryItemId ? -1 : 1),
    )
    .map(({ inventoryItemId, kind, expected, actual, reason }) => ({
      inventoryItemId,
      kind,
      expected,
      actual,
      reason,
    }));
}
