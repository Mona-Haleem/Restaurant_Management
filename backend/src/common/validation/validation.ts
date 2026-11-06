import { HttpStatus, ValidationPipe, type ValidationError } from '@nestjs/common';
import { AppException } from '../errors/app-exception';

export interface FieldError {
  field: string;
  messages: string[];
}

function flatten(errors: readonly ValidationError[], parent: string, out: FieldError[]): void {
  for (const error of errors) {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const children = error.children ?? [];
    if (error.constraints) {
      out.push({ field, messages: Object.values(error.constraints) });
    } else if (children.length === 0) {
      out.push({ field, messages: [`${error.property} is invalid`] });
    }
    flatten(children, field, out);
  }
}

/** class-validator errors → 400 VALIDATION_FAILED with one entry per (nested) field. */
export function validationExceptionFactory(errors: ValidationError[]): AppException {
  const fields: FieldError[] = [];
  flatten(errors, '', fields);
  return new AppException(
    HttpStatus.BAD_REQUEST,
    'VALIDATION_FAILED',
    'Request validation failed',
    {
      fields,
    },
  );
}

/**
 * Global request validation (ARCHITECTURE §3): unknown properties are rejected, not stripped
 * silently, so a client can never smuggle fields such as tenantId into a write.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: validationExceptionFactory,
  });
}
