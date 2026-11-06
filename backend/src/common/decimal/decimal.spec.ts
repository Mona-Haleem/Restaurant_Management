import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Prisma } from '../../generated/prisma/client';
import { formatDecimal, IsDecimalString, MONEY, QUANTITY } from './decimal';

// ADR 0013: decimals travel as strings with the column's scale, in both directions.

describe('formatDecimal', () => {
  it.each([
    ['185', MONEY, '185.00'],
    ['0.15', QUANTITY, '0.150'],
    ['-2', QUANTITY, '-2.000'],
    ['12.5', MONEY, '12.50'],
  ] as const)('%s → %s', (value, kind, expected) => {
    expect(formatDecimal(new Prisma.Decimal(value), kind)).toBe(expected);
  });
});

class Probe {
  @IsDecimalString(MONEY)
  price!: string;

  @IsDecimalString(QUANTITY, { positive: true })
  quantity!: string;
}

const errorsFor = (price: unknown, quantity: unknown): string[] =>
  validateSync(plainToInstance(Probe, { price, quantity })).map((e) => e.property);

describe('IsDecimalString', () => {
  it('accepts plain decimal strings that fit the column', () => {
    expect(errorsFor('0', '0.001')).toEqual([]);
    expect(errorsFor('185.5', '150')).toEqual([]);
    expect(errorsFor('9999999999.99', '99999999999.999')).toEqual([]);
  });

  it.each([
    ['a number, not a string', 185, 'price'],
    ['too many decimals', '1.005', 'price'],
    ['too many integer digits', '10000000000', 'price'],
    ['a negative price', '-1', 'price'],
    ['exponent notation', '1e3', 'price'],
    ['an empty string', '', 'price'],
  ])('rejects a price with %s', (_case, price, field) => {
    expect(errorsFor(price, '1')).toEqual([field]);
  });

  it.each(['0', '0.000', '-1', '1.0005', 'abc'])(
    'rejects quantity %s when positive is required',
    (q) => {
      expect(errorsFor('1', q)).toEqual(['quantity']);
    },
  );
});
