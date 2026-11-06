import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import type { AppEnv } from '../src/config/environment';
import { testConfig } from './test-config';

const committedSpec: unknown = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'openapi.json'), 'utf8'),
);

async function startApp(appEnv: AppEnv): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(testConfig({ appEnv, corsOrigins: ['https://tablz.app'] }))],
  }).compile();
  const app = configureApp(
    moduleRef.createNestApplication<INestApplication<App>>({ bufferLogs: true }),
  );
  await app.init();
  return app;
}

describe('OpenAPI endpoints (e2e)', () => {
  describe.each(['local', 'staging'] as const)('APP_ENV=%s', (appEnv) => {
    let app: INestApplication<App>;
    beforeAll(async () => {
      app = await startApp(appEnv);
    });
    afterAll(() => app.close());

    it('serves exactly the committed contract at /v1/openapi.json', async () => {
      const res = await request(app.getHttpServer()).get('/v1/openapi.json').expect(200);
      expect(res.body).toEqual(committedSpec);
    });

    it('serves the Swagger UI at /v1/docs', async () => {
      const res = await request(app.getHttpServer()).get('/v1/docs').redirects(1).expect(200);
      expect(res.text).toContain('swagger');
    });
  });

  describe('APP_ENV=production', () => {
    let app: INestApplication<App>;
    beforeAll(async () => {
      app = await startApp('production');
    });
    afterAll(() => app.close());

    it('still serves the spec (it is the public contract)', async () => {
      await request(app.getHttpServer()).get('/v1/openapi.json').expect(200);
    });

    it('does not serve the Swagger UI', async () => {
      const res = await request(app.getHttpServer()).get('/v1/docs').expect(404);
      expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
    });
  });
});
