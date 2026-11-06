import { HttpException } from '@nestjs/common';

/**
 * The one way feature code reports an expected failure. `code` is a stable string the frontend
 * switches on (e.g. ORDER_NOT_CANCELLABLE); `details` carries machine-readable context.
 */
export class AppException extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super({ code, message, details }, status);
  }
}
