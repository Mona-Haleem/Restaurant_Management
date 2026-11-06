import type { INestApplication } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { isOriginAllowed } from './common/http/cors';
import { REQUEST_ID_HEADER } from './common/logging/logger-options';
import { APP_CONFIG, type AppConfig } from './config/app-config';

export const API_PREFIX = 'v1';

/**
 * App-wide HTTP setup shared by `main.ts` and the e2e tests, so tests boot exactly the app
 * production runs. Validation and the error filter are registered in CommonModule.
 */
export function configureApp<T extends INestApplication>(app: T): T {
  const config = app.get<AppConfig>(APP_CONFIG);

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(API_PREFIX);
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) =>
      callback(null, isOriginAllowed(origin, config.corsOrigins)),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // B503 adds the x-dev-* context headers (ADR 0007) here.
    allowedHeaders: ['content-type', 'if-none-match', REQUEST_ID_HEADER],
    exposedHeaders: [REQUEST_ID_HEADER, 'etag'],
    maxAge: 600,
  });
  return app;
}
