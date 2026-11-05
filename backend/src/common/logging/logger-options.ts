import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import type { Options } from 'pino-http';
import type { AppConfig } from '../../config/app-config';

export const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * One id per request: reuse a well-formed incoming `x-request-id` (so a proxy or the frontend can
 * correlate), otherwise generate a UUID. Always echoed in the response header.
 */
export function requestIdFor(req: IncomingMessage, res: ServerResponse): string {
  const header = req.headers[REQUEST_ID_HEADER];
  const incoming = Array.isArray(header) ? header[0] : header;
  const id = incoming !== undefined && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

/** Structured JSON logs; every line written during a request carries `req.id`. */
export function buildLoggerOptions(
  config: Pick<AppConfig, 'appEnv' | 'logLevel'>,
  stream?: DestinationStream,
): Params {
  const options: Options = {
    level: config.logLevel,
    genReqId: requestIdFor,
    redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    ...(config.appEnv === 'local' && !stream
      ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
      : {}),
  };
  return { pinoHttp: stream ? [options, stream] : options };
}
