import type { INestApplication } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { isOriginAllowed } from './common/http/cors';
import { REQUEST_ID_HEADER } from './common/logging/logger-options';
import { APP_CONFIG, type AppConfig } from './config/app-config';
import { isDisposableEnv } from './config/environment';
import { DEV_HEADERS } from './context/dev-headers';
import { setupOpenApi } from './openapi/openapi';

export const API_PREFIX = 'v1';

/**
 * App-wide HTTP setup shared by `main.ts` and the e2e tests, so tests boot exactly the app
 * production runs. Validation and the error filter are registered in CommonModule.
 */
export function configureApp<T extends INestApplication>(app: T): T {
  const config = app.get<AppConfig>(APP_CONFIG);

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(API_PREFIX);
  if (!isDisposableEnv(config.appEnv)) {
    // Render terminates TLS in front of the app: trust one proxy hop, so the rate limit sees the
    // client's IP (X-Forwarded-For) instead of the proxy's. Locally there is no proxy to trust.
    const express = app.getHttpAdapter().getInstance() as {
      set(key: string, value: unknown): void;
    };
    express.set('trust proxy', 1);
  }
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) =>
      callback(null, isOriginAllowed(origin, config.corsOrigins)),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // x-dev-*: Phase 1 identity headers (ADR 0007), removed when JWT ships.
    allowedHeaders: [
      'content-type',
      'if-none-match',
      REQUEST_ID_HEADER,
      DEV_HEADERS.role,
      DEV_HEADERS.user,
      DEV_HEADERS.branch,
    ],
    exposedHeaders: [REQUEST_ID_HEADER, 'etag'],
    maxAge: 600,
  });
  setupOpenApi(app, config); // after setGlobalPrefix, so documented paths start with /v1
  return app;
}
