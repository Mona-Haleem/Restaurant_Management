import { Transform } from 'class-transformer';
import { ValidateIf } from 'class-validator';

/**
 * For PATCH fields backed by a NOT NULL column: a missing field is skipped, but an explicit
 * `null` is validated (and refused) like any other value. `@IsOptional()` would let `null` through
 * to Prisma, which then fails with a 500. Use `@IsOptional()` only where `null` means something.
 */
export function IsOptionalNotNull(): PropertyDecorator {
  return ValidateIf((_object: unknown, value: unknown) => value !== undefined);
}

/** Trims surrounding whitespace from a string input, so "  Burgers " and "Burgers" are one name. */
export function Trim(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
}
