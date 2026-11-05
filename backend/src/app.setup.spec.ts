import type { INestApplication } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { API_PREFIX, configureApp } from './app.setup';
import { APP_CONFIG } from './config/app-config';

describe('configureApp', () => {
  const logger = { log: jest.fn() };
  const config = { corsOrigins: ['http://localhost:4200'] };

  function fakeApp(): {
    get: jest.Mock;
    useLogger: jest.Mock;
    setGlobalPrefix: jest.Mock;
    enableCors: jest.Mock<void, [unknown]>;
  } {
    return {
      get: jest.fn((token: unknown) =>
        token === APP_CONFIG ? config : token === Logger && logger,
      ),
      useLogger: jest.fn(),
      setGlobalPrefix: jest.fn(),
      enableCors: jest.fn<void, [unknown]>(),
    };
  }

  it('puts every route under /v1 and uses the structured logger', () => {
    const app = fakeApp();
    expect(configureApp(app as unknown as INestApplication)).toBe(app);
    expect(API_PREFIX).toBe('v1');
    expect(app.setGlobalPrefix).toHaveBeenCalledWith('v1');
    expect(app.useLogger).toHaveBeenCalledWith(logger);
  });

  it('answers CORS from the configured allowlist', () => {
    const app = fakeApp();
    configureApp(app as unknown as INestApplication);
    const options = app.enableCors.mock.calls[0]?.[0] as {
      origin: (
        origin: string | undefined,
        cb: (err: Error | null, allow?: boolean) => void,
      ) => void;
      exposedHeaders: string[];
    };
    const cb = jest.fn();
    options.origin('http://localhost:4200', cb);
    options.origin('https://evil.example', cb);
    expect(cb.mock.calls).toEqual([
      [null, true],
      [null, false],
    ]);
    expect(options.exposedHeaders).toContain('x-request-id');
  });
});
