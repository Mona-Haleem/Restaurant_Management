import type { INestApplication } from '@nestjs/common';

export const API_PREFIX = 'v1';

/**
 * App-wide configuration shared by `main.ts` and the e2e tests, so tests boot
 * exactly the app production runs. B501 adds the ValidationPipe and error filter here.
 */
export function configureApp<T extends INestApplication>(app: T): T {
  app.setGlobalPrefix(API_PREFIX);
  return app;
}
