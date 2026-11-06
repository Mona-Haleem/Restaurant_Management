import type { INestApplication } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { API_PREFIX, configureApp } from './app.setup';
import { APP_CONFIG } from './config/app-config';
import { setupOpenApi } from './openapi/openapi';

// The real Swagger setup needs a real app; it is covered by openapi.spec.ts and the e2e tests.
jest.mock('./openapi/openapi', () => ({ setupOpenApi: jest.fn() }));

describe('configureApp', () => {
  const logger = { log: jest.fn() };
  let config: { appEnv: string; corsOrigins: string[] };
  const express = { set: jest.fn() };
  beforeEach(() => {
    config = { appEnv: 'local', corsOrigins: ['http://localhost:4200'] };
    express.set.mockClear();
  });

  function fakeApp(): {
    get: jest.Mock;
    useLogger: jest.Mock;
    setGlobalPrefix: jest.Mock;
    enableCors: jest.Mock<void, [unknown]>;
    getHttpAdapter: jest.Mock;
  } {
    return {
      get: jest.fn((token: unknown) =>
        token === APP_CONFIG ? config : token === Logger && logger,
      ),
      useLogger: jest.fn(),
      setGlobalPrefix: jest.fn(),
      enableCors: jest.fn<void, [unknown]>(),
      getHttpAdapter: jest.fn(() => ({ getInstance: () => express })),
    };
  }

  it('serves the OpenAPI spec', () => {
    const app = fakeApp();
    configureApp(app as unknown as INestApplication);
    expect(setupOpenApi).toHaveBeenCalledWith(app, config);
  });

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
      allowedHeaders: string[];
    };
    const cb = jest.fn();
    options.origin('http://localhost:4200', cb);
    options.origin('https://evil.example', cb);
    expect(cb.mock.calls).toEqual([
      [null, true],
      [null, false],
    ]);
    expect(options.exposedHeaders).toContain('x-request-id');
    expect(options.allowedHeaders).toEqual(
      expect.arrayContaining(['x-dev-role', 'x-dev-user', 'x-dev-branch']),
    );
  });

  it.each(['staging', 'production'])(
    'trusts one proxy hop on %s (Render), for the rate limit',
    (appEnv) => {
      config.appEnv = appEnv;
      configureApp(fakeApp() as unknown as INestApplication);
      expect(express.set).toHaveBeenCalledWith('trust proxy', 1);
    },
  );

  it.each(['local', 'test'])('trusts no proxy on %s', (appEnv) => {
    config.appEnv = appEnv;
    configureApp(fakeApp() as unknown as INestApplication);
    expect(express.set).not.toHaveBeenCalled();
  });
});
