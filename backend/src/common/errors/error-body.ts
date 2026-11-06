import { HttpException } from '@nestjs/common';
import { AppException } from './app-exception';

/** The only error shape the API ever returns (ARCHITECTURE §7). */
export interface ErrorBody {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export interface ErrorResponse {
  status: number;
  body: ErrorBody;
}

const CODE_BY_STATUS: Readonly<Record<number, string>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

const INTERNAL: ErrorResponse = {
  status: 500,
  body: { code: 'INTERNAL_ERROR', message: 'Internal server error', details: {} },
};

function messageOf(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  const message = (response as { message?: unknown }).message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  return exception.message;
}

/**
 * Maps anything thrown to `{ status, body }`. Unknown errors become a generic 500: their message
 * and stack may hold internals (SQL, connection strings), so they go to the logs only.
 * Body-parser errors (malformed JSON, oversized body) arrive already mapped by Nest's Express
 * adapter to 400 / 413 HttpExceptions, so they need no special case here.
 */
export function toErrorResponse(exception: unknown): ErrorResponse {
  if (exception instanceof AppException) {
    return { status: exception.getStatus(), body: exception.getResponse() as ErrorBody };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    return {
      status,
      body: {
        code: CODE_BY_STATUS[status] ?? `HTTP_${status}`,
        // A 5xx message is often built from an internal error: never send it. Use AppException
        // for a deliberate 5xx message.
        message: status >= 500 ? INTERNAL.body.message : messageOf(exception),
        details: {},
      },
    };
  }
  return INTERNAL;
}
