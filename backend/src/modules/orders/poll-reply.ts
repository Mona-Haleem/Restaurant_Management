import { applyDecorators } from '@nestjs/common';
import { ApiHeader, ApiResponse } from '@nestjs/swagger';
import type { Polled } from './order-queries.service';

/** The bit of the HTTP response a polled route needs (Express's `res`, without its types). */
export interface PollResponse {
  setHeader(name: string, value: string): unknown;
  status(code: number): unknown;
}

/**
 * Sends a polled answer: always the ETag (and `no-cache`, so caches revalidate every time);
 * 304 with no body when the caller's If-None-Match still matches (ADR 0024).
 */
export function reply<T>(res: PollResponse, polled: Polled<T>): T | undefined {
  res.setHeader('ETag', polled.etag);
  res.setHeader('Cache-Control', 'private, no-cache');
  if (polled.body === null) {
    res.status(304);
    return undefined;
  }
  return polled.body;
}

/** OpenAPI for a polled route: the If-None-Match header and the 304 answer. */
export function Polling(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiHeader({
      name: 'If-None-Match',
      required: false,
      description: 'The ETag of the previous answer. Unchanged → 304 with no body (ADR 0024).',
    }),
    ApiResponse({ status: 304, description: 'Not modified: nothing changed since that ETag.' }),
  );
}
