import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  buildLoggerOptions,
  redactTrackingToken,
  requestIdFor,
  REQUEST_ID_HEADER,
} from './logger-options';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function fakeExchange(header?: string): {
  req: IncomingMessage;
  res: ServerResponse;
  sent: Record<string, string>;
} {
  const sent: Record<string, string> = {};
  const req = { headers: header === undefined ? {} : { [REQUEST_ID_HEADER]: header } };
  const res = {
    setHeader: (name: string, value: string) => {
      sent[name] = value;
    },
  };
  return {
    req: req as unknown as IncomingMessage,
    res: res as unknown as ServerResponse,
    sent,
  };
}

describe('requestIdFor', () => {
  it('reuses a well-formed incoming x-request-id and echoes it', () => {
    const { req, res, sent } = fakeExchange('abc-123_DEF.9');
    expect(requestIdFor(req, res)).toBe('abc-123_DEF.9');
    expect(sent[REQUEST_ID_HEADER]).toBe('abc-123_DEF.9');
  });

  it('generates a UUID when there is none', () => {
    const { req, res, sent } = fakeExchange();
    const id = requestIdFor(req, res);
    expect(id).toMatch(UUID);
    expect(sent[REQUEST_ID_HEADER]).toBe(id);
  });

  it.each(['', 'has spaces', 'x'.repeat(129), 'inject\nnewline', '<script>'])(
    'replaces a malformed incoming id (%p) so it cannot pollute the logs',
    (header) => {
      const { req, res } = fakeExchange(header);
      expect(requestIdFor(req, res)).toMatch(UUID);
    },
  );
});

describe('buildLoggerOptions', () => {
  it('uses the configured level and redacts credentials', () => {
    const options = buildLoggerOptions({ appEnv: 'production', logLevel: 'info' });
    const pinoHttp = options.pinoHttp as Record<string, unknown>;
    expect(pinoHttp.level).toBe('info');
    expect(pinoHttp.redact).toEqual(
      expect.arrayContaining(['req.headers.authorization', 'req.headers.cookie']),
    );
    expect(pinoHttp.transport).toBeUndefined();
  });

  it('pretty-prints only for local development', () => {
    const local = buildLoggerOptions({ appEnv: 'local', logLevel: 'debug' });
    expect((local.pinoHttp as Record<string, unknown>).transport).toEqual({
      target: 'pino-pretty',
      options: { singleLine: true },
    });
  });

  it('writes to a given stream (used by tests to read the JSON lines)', () => {
    const stream = { write: (): boolean => true };
    const options = buildLoggerOptions({ appEnv: 'test', logLevel: 'info' }, stream);
    expect(options.pinoHttp).toEqual([expect.objectContaining({ level: 'info' }), stream]);
  });
});

describe('tracking token redaction (ADR 0008)', () => {
  it.each([
    ['/v1/nile-bites/track/abcDEF_123-xyz/cancel', '/v1/nile-bites/track/[REDACTED]/cancel'],
    ['/v1/nile-bites/track/abcDEF_123-xyz', '/v1/nile-bites/track/[REDACTED]'],
    ['/v1/nile-bites/track/abc?x=1', '/v1/nile-bites/track/[REDACTED]?x=1'],
    ['/v1/nile-bites/orders/123/cancel', '/v1/nile-bites/orders/123/cancel'],
    ['/v1/track', '/v1/track'],
  ])('%s → %s', (url, expected) => {
    expect(redactTrackingToken(url)).toBe(expected);
  });

  it('is applied to the request line pino-http logs', () => {
    const options = buildLoggerOptions({ appEnv: 'production', logLevel: 'info' });
    const serializers = (options.pinoHttp as { serializers: { req: (r: unknown) => unknown } })
      .serializers;
    const params = { splat: ['a', 'track', 'secret', 'cancel'] };
    expect(serializers.req({ method: 'POST', url: '/v1/a/track/secret/cancel', params })).toEqual({
      method: 'POST',
      url: '/v1/a/track/[REDACTED]/cancel',
    });
    // Other routes keep their params.
    const other = { method: 'GET', url: '/v1/a/menu', params: { splat: ['a', 'menu'] } };
    expect(serializers.req(other)).toBe(other);
  });
});
