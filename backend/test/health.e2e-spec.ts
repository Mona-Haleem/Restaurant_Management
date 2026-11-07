import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import type { AppConfig } from '../src/config/app-config';
import { bodyOf } from './http';
import { testConfig } from './test-config';

// B503 acceptance: /health is cheap; /health/db runs a trivial query and fails when the database
// is unreachable. Both stay outside the rate limit, so keep-alive pings (B1203) never get a 429.

async function boot(overrides: Partial<AppConfig> = {}): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(testConfig(overrides))],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication<INestApplication<App>>());
  await app.init();
  return app;
}

describe('health (B503)', () => {
  describe('with the test database', () => {
    let app: INestApplication<App>;
    beforeAll(async () => {
      app = await boot();
    });
    afterAll(() => app.close());

    it('GET /v1/health answers ok, with no commit when not deployed', async () => {
      const res = await request(app.getHttpServer()).get('/v1/health').expect(200);
      expect(bodyOf(res)).toEqual({ status: 'ok', commit: null });
    });

    it('GET /v1/health names the deployed commit (the deploy workflows wait for it)', async () => {
      const deployed = await boot({ gitCommit: '0e0195c4f2b1a3d4e5f60718293a4b5c6d7e8f90' });
      try {
        const res = await request(deployed.getHttpServer()).get('/v1/health').expect(200);
        expect(bodyOf(res)).toEqual({
          status: 'ok',
          commit: '0e0195c4f2b1a3d4e5f60718293a4b5c6d7e8f90',
        });
      } finally {
        await deployed.close();
      }
    });

    it('GET /v1/health/db answers ok after a real query', async () => {
      const res = await request(app.getHttpServer()).get('/v1/health/db').expect(200);
      expect(bodyOf(res)).toEqual({ status: 'ok', database: 'up' });
    });
  });

  describe('when the database is unreachable', () => {
    let app: INestApplication<App>;
    beforeAll(async () => {
      // Port 1 on localhost: nothing listens there, so every connection is refused.
      app = await boot({ databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:1/tablz_test' });
    });
    afterAll(() => app.close());

    it('GET /v1/health/db answers 503 DATABASE_UNAVAILABLE without leaking the error', async () => {
      const res = await request(app.getHttpServer()).get('/v1/health/db').expect(503);
      expect(bodyOf(res)).toEqual({
        code: 'DATABASE_UNAVAILABLE',
        message: 'The database is not reachable.',
        details: {},
      });
    });

    it('GET /v1/health still answers ok (it never touches the database)', async () => {
      await request(app.getHttpServer()).get('/v1/health').expect(200);
    });
  });
});

describe('rate limiting (B503)', () => {
  let app: INestApplication<App>;
  beforeAll(async () => {
    app = await boot({ rateLimit: { max: 3, windowSeconds: 60 } });
  });
  afterAll(() => app.close());

  it('answers 429 RATE_LIMITED in the shared error shape once the limit is used up', async () => {
    for (let i = 0; i < 3; i += 1) await request(app.getHttpServer()).get('/v1').expect(200);
    const res = await request(app.getHttpServer()).get('/v1').expect(429);
    expect(bodyOf(res)).toEqual({
      code: 'RATE_LIMITED',
      message: 'Too many requests. Try again shortly.',
      details: { retryAfterSeconds: expect.any(Number) as unknown },
    });
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('never limits the health routes', async () => {
    for (let i = 0; i < 6; i += 1) {
      await request(app.getHttpServer()).get('/v1/health').expect(200);
      await request(app.getHttpServer()).get('/v1/health/db').expect(200);
    }
  });
});
