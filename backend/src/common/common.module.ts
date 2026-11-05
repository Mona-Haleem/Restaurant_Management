import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AllExceptionsFilter } from './errors/all-exceptions.filter';
import { createValidationPipe } from './validation/validation';

/**
 * Cross-cutting request handling, registered through DI so it applies to every route in every
 * module (and in every test that imports AppModule), not only where someone remembered it.
 */
@Module({
  providers: [
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class CommonModule {}
