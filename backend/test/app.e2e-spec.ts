import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { testConfig } from './test-config';

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(testConfig())],
    }).compile();
    app = configureApp(
      moduleRef.createNestApplication<INestApplication<App>>({ bufferLogs: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /v1 answers with the API name', async () => {
    await request(app.getHttpServer()).get('/v1').expect(200).expect({ name: 'tablz-api' });
  });

  it('routes outside /v1 are not served', async () => {
    await request(app.getHttpServer()).get('/').expect(404);
  });
});
