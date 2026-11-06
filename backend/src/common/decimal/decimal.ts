import { ValidateBy, type ValidationOptions } from 'class-validator';
import { Prisma } from '../../generated/prisma/client';

/**
 * Decimals on the wire (ADR 0013): every `numeric` column travels as a JSON string with the
 * column's scale, in requests and responses, so neither side ever holds a rounded float.
 */
export interface DecimalKind {
  /** Digits after the point (the column's scale). */
  scale: number;
  /** Digits before the point (precision minus scale). */
  integerDigits: number;
  /** Shown in OpenAPI. */
  pattern: string;
  example: string;
}

const kind = (precision: number, scale: number, example: string): DecimalKind => ({
  scale,
  integerDigits: precision - scale,
  pattern: `^\\d{1,${precision - scale}}(\\.\\d{1,${scale}})?$`,
  example,
});

/** numeric(12,2): prices and totals. */
export const MONEY = kind(12, 2, '185.00');
/** numeric(14,3): stock quantities and recipe quantities. */
export const QUANTITY = kind(14, 3, '0.150');
/** numeric(14,4): unit costs. */
export const COST = kind(14, 4, '420.0000');

/** Parses a validated decimal string (see IsDecimalString). Feature code never builds a PrismaClient. */
export function parseDecimal(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

/** A Decimal as its wire string, padded to the column's scale (`"185.00"`, `"0.150"`). */
export function formatDecimal(value: Prisma.Decimal, decimal: DecimalKind): string {
  return value.toFixed(decimal.scale);
}

/**
 * Validates a non-negative decimal string that fits the column, e.g. `"99.5"` for MONEY.
 * Numbers, exponents, signs and extra decimals are refused, never rounded (ADR 0013).
 * With `positive`, zero is refused too.
 */
export function IsDecimalString(
  decimal: DecimalKind,
  options: { positive?: boolean } = {},
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  const pattern = new RegExp(decimal.pattern);
  return ValidateBy(
    {
      name: 'isDecimalString',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' &&
          pattern.test(value) &&
          (!options.positive || /[1-9]/.test(value)),
        defaultMessage: (args) =>
          `${args?.property ?? 'value'} must be a${options.positive ? ' positive' : ''} decimal ` +
          `string with at most ${decimal.integerDigits} digits before and ${decimal.scale} after the point`,
      },
    },
    validationOptions,
  );
}
