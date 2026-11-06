import { Prisma } from '../../generated/prisma/client';
import { convertQuantity, sameDimension, UnitDimensionError } from './units';

// ADR 0003: fixed units, exact conversion within a dimension, nothing across dimensions.

const D = (v: string) => new Prisma.Decimal(v);

describe('convertQuantity', () => {
  it.each([
    ['150', 'G', 'KG', '0.15'],
    ['0.15', 'KG', 'G', '150'],
    ['30', 'ML', 'L', '0.03'],
    ['2', 'L', 'ML', '2000'],
    ['3', 'PCS', 'PCS', '3'],
  ] as const)('%s %s = %s %s', (qty, from, to, expected) => {
    expect(convertQuantity(D(qty), from, to).toString()).toBe(expected);
  });

  it('refuses another dimension', () => {
    expect(() => convertQuantity(D('1'), 'G', 'L')).toThrow(UnitDimensionError);
    expect(() => convertQuantity(D('1'), 'PCS', 'KG')).toThrow(/UNIT_DIMENSION_MISMATCH/);
  });
});

describe('sameDimension', () => {
  it('groups G/KG, ML/L and PCS', () => {
    expect([
      sameDimension('G', 'KG'),
      sameDimension('ML', 'L'),
      sameDimension('PCS', 'PCS'),
    ]).toEqual([true, true, true]);
    expect([sameDimension('G', 'ML'), sameDimension('L', 'PCS')]).toEqual([false, false]);
  });
});
