import { Prisma } from '../../generated/prisma/client';
import { assertScale, toStockUnit } from './quantities';

const D = (v: string) => new Prisma.Decimal(v);

describe('toStockUnit (ADR 0003)', () => {
  it.each([
    ['150', 'G', 'KG', '0.15'],
    ['0.15', 'KG', 'G', '150'],
    ['120', 'ML', 'L', '0.12'],
    ['2', 'L', 'ML', '2000'],
    ['3', 'PCS', 'PCS', '3'],
    ['1.5', 'KG', 'KG', '1.5'],
  ] as const)('%s %s is %s %s', (qty, from, to, expected) => {
    expect(toStockUnit(D(qty), from, to).toString()).toBe(expected);
  });

  it('rejects units from another dimension', () => {
    expect(() => toStockUnit(D('1'), 'G', 'L')).toThrow(/UNIT_DIMENSION_MISMATCH/);
    expect(() => toStockUnit(D('1'), 'PCS', 'KG')).toThrow(/UNIT_DIMENSION_MISMATCH/);
  });
});

describe('assertScale (ADR 0013: never round an input)', () => {
  it('accepts values that fit the scale', () => {
    expect(() => assertScale(D('0.125'), 3, 'q')).not.toThrow();
    expect(() => assertScale(D('12'), 2, 'p')).not.toThrow();
  });

  it('rejects values with more decimals than the column holds', () => {
    expect(() => assertScale(D('0.0005'), 3, 'garlic')).toThrow(/garlic.*3 decimals/);
  });
});
