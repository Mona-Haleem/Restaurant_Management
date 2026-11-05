import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { Writable } from 'node:stream';
import { Body, Controller, Get, HttpStatus, Post, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Type } from 'class-transformer';
import { IsInt, IsString, Min, ValidateNested } from 'class-validator';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AppException } from '../src/common/errors/app-exception';
import { testConfig } from './test-config';
import { testEnv } from './test-env';

// B501 acceptance: config fails fast; every error has one shape and no stack trace;
// logs are structured and carry a request id; CORS follows the allowlist.

class LineDto {
  @IsInt()
  @Min(1)
  qty!: number;
}

class ProbeDto {
  @IsString()
  name!: string;

  @ValidateNested({ each: true })
  @Type(() => LineDto)
  lines!: LineDto[];
}

/** Test-only routes that provoke each kind of error. */
@Controller('probe')
class ProbeController {
  @Post()
  create(@Body() body: ProbeDto): { name: string } {
    return { name: body.name };
  }

  @Get('boom')
  boom(): never {
    throw new Error('connection to postgres://admin:hunter2@db failed');
  }

  @Get('domain-error')
  domainError(): never {
    throw new AppException(
      HttpStatus.CONFLICT,
      'ORDER_NOT_CANCELLABLE',
      'Order is past cancellation',
      {
        orderId: 'o-1',
      },
    );
  }
}

const SECRET = 'hunter2';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('platform: errors, validation, logging, CORS (e2e)', () => {
  let app: INestApplication<App>;
  const logLines: Record<string, unknown>[] = [];

  beforeAll(async () => {
    const logStream = new Writable({
      write(chunk: Buffer, _encoding, done): void {
        for (const line of chunk.toString().split('\n').filter(Boolean)) {
          logLines.push(JSON.parse(line) as Record<string, unknown>);
        }
        done();
      },
    });
    const moduleRef = await Test.createTestingModule({
      imports: [
        AppModule.register(
          testConfig({
            logLevel: 'info',
            corsOrigins: ['http://localhost:4200', 'https://tablz-*-mona.vercel.app'],
          }),
          { logStream },
        ),
      ],
      controllers: [ProbeController],
    }).compile();
    app = configureApp(
      moduleRef.createNestApplication<INestApplication<App>>({ bufferLogs: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = (): ReturnType<typeof request> => request(app.getHttpServer());

  describe('error shape', () => {
    it('a validation failure is 400 VALIDATION_FAILED with the fields', async () => {
      const res = await http()
        .post('/v1/probe')
        .send({ name: 7, lines: [{ qty: 0 }] })
        .expect(400);
      expect(res.body).toEqual({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: {
          fields: [
            { field: 'name', messages: ['name must be a string'] },
            { field: 'lines.0.qty', messages: ['qty must not be less than 1'] },
          ],
        },
      });
    });

    it('unknown body properties are rejected', async () => {
      const res = await http()
        .post('/v1/probe')
        .send({ name: 'ok', lines: [], tenantId: 'other' })
        .expect(400);
      expect(res.body).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: { fields: [{ field: 'tenantId' }] },
      });
    });

    it('a valid body passes', async () => {
      await http()
        .post('/v1/probe')
        .send({ name: 'ok', lines: [{ qty: 1 }] })
        .expect(201, {
          name: 'ok',
        });
    });

    it('malformed JSON is 400 BAD_REQUEST in the same shape', async () => {
      const res = await http()
        .post('/v1/probe')
        .set('content-type', 'application/json')
        .send('{"name": ')
        .expect(400);
      expect(res.body).toEqual({
        code: 'BAD_REQUEST',
        message: expect.any(String) as unknown,
        details: {},
      });
      expect(res.text).not.toMatch(/\bat \S+ \(/);
    });

    it('an oversized body is 413 PAYLOAD_TOO_LARGE in the same shape', async () => {
      const res = await http()
        .post('/v1/probe')
        .send({ name: 'x'.repeat(200 * 1024), lines: [] })
        .expect(413);
      expect(res.body).toEqual({
        code: 'PAYLOAD_TOO_LARGE',
        message: 'request entity too large',
        details: {},
      });
    });

    it('a domain AppException keeps its code and details', async () => {
      const res = await http().get('/v1/probe/domain-error').expect(409);
      expect(res.body).toEqual({
        code: 'ORDER_NOT_CANCELLABLE',
        message: 'Order is past cancellation',
        details: { orderId: 'o-1' },
      });
    });

    it('an unknown route is 404 NOT_FOUND', async () => {
      const res = await http().get('/v1/nope').expect(404);
      expect(res.body).toEqual({ code: 'NOT_FOUND', message: 'Cannot GET /v1/nope', details: {} });
    });

    it('an unexpected error is a generic 500 with no stack trace or internals', async () => {
      const res = await http().get('/v1/probe/boom').expect(500);
      expect(res.body).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        details: {},
      });
      expect(res.text).not.toContain(SECRET);
      expect(res.text).not.toMatch(/\bat \S+ \(/); // no stack frames
    });
  });

  describe('structured logs with a request id', () => {
    it('generates a request id, returns it, and logs the request with it as JSON', async () => {
      const res = await http().get('/v1').expect(200);
      const id = res.headers['x-request-id'];
      expect(id).toMatch(UUID);
      const line = logLines.find((l) => (l.req as { id?: string } | undefined)?.id === id);
      expect(line).toMatchObject({ level: 30, msg: 'request completed', res: { statusCode: 200 } });
    });

    it('reuses a well-formed incoming x-request-id', async () => {
      const res = await http().get('/v1').set('x-request-id', 'trace-abc.123').expect(200);
      expect(res.headers['x-request-id']).toBe('trace-abc.123');
    });

    it('logs a 500 with its stack under the same request id, server-side only', async () => {
      const res = await http().get('/v1/probe/boom').expect(500);
      const id = res.headers['x-request-id'];
      const line = logLines.find(
        (l) => l.msg === 'Unhandled error' && (l.req as { id?: string } | undefined)?.id === id,
      );
      expect(line).toMatchObject({
        level: 50,
        err: { message: expect.stringContaining('connection') as unknown },
      });
      expect((line?.err as { stack?: string }).stack).toContain('ProbeController');
    });

    it('redacts credentials in request headers', async () => {
      const res = await http().get('/v1').set('authorization', `Bearer ${SECRET}`).expect(200);
      const id = res.headers['x-request-id'];
      const line = logLines.find((l) => (l.req as { id?: string } | undefined)?.id === id);
      expect(JSON.stringify(line)).not.toContain(SECRET);
    });
  });

  describe('CORS allowlist', () => {
    it.each(['http://localhost:4200', 'https://tablz-k3j9x2-mona.vercel.app'])(
      'allows %s',
      async (origin) => {
        const res = await http().get('/v1').set('origin', origin).expect(200);
        expect(res.headers['access-control-allow-origin']).toBe(origin);
        expect(res.headers['access-control-expose-headers']).toContain('x-request-id');
      },
    );

    it('answers a preflight for an allowed origin', async () => {
      const res = await http()
        .options('/v1/probe')
        .set('origin', 'http://localhost:4200')
        .set('access-control-request-method', 'POST')
        .set('access-control-request-headers', 'content-type')
        .expect(204);
      expect(res.headers['access-control-allow-methods']).toContain('POST');
    });

    it('gives no CORS headers to a disallowed origin', async () => {
      const res = await http().get('/v1').set('origin', 'https://evil.example');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});

describe('fail-fast config (real entrypoint)', () => {
  const backendDir = path.join(__dirname, '..');

  function start(env: NodeJS.ProcessEnv): { status: number | null; output: string } {
    const result = spawnSync(process.execPath, ['dist/main.js'], {
      cwd: backendDir,
      env,
      encoding: 'utf8',
      timeout: 30_000,
    });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  }

  it('a missing variable stops startup with a clear message', () => {
    // An empty value is not overridden by .env / .env.example.
    const { status, output } = start(testEnv({ DATABASE_URL: '' }));
    expect(status).toBe(1);
    expect(output).toContain('Refusing to start: DATABASE_URL is required.');
  });

  it('lists every problem at once', () => {
    const { status, output } = start(testEnv({ PORT: 'eighty', LOG_LEVEL: 'loud' }));
    expect(status).toBe(1);
    expect(output).toContain('Refusing to start: 2 configuration problems:');
    expect(output).toContain('- PORT must be an integer between 1 and 65535.');
    expect(output).toContain('- LOG_LEVEL must be one of');
  });

  it('staging without a CORS allowlist does not start', () => {
    const { status, output } = start(
      testEnv({
        APP_ENV: 'staging',
        DATABASE_URL: 'postgresql://u:p@db.example.com:5432/x',
        CORS_ORIGINS: '',
      }),
    );
    expect(status).toBe(1);
    expect(output).toContain('CORS_ORIGINS is required when APP_ENV=staging');
  });
});
