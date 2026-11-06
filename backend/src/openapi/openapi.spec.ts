import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { testConfig } from '../../test/test-config';
import { AppModule } from '../app.module';
import { configureApp } from '../app.setup';
import {
  buildOpenApiDocument,
  ERROR_RESPONSE_SCHEMA,
  HTTP_METHODS,
  OPENAPI_FILE,
  serializeOpenApi,
  withDefaultErrorResponses,
} from './openapi';

const METHODS = HTTP_METHODS;

function operations(
  document: OpenAPIObject,
): { route: string; operation: Record<string, unknown> }[] {
  return Object.entries(document.paths).flatMap(([route, item]) =>
    METHODS.flatMap((method) => {
      const operation = (item as Record<string, unknown>)[method];
      return operation
        ? [
            {
              route: `${method.toUpperCase()} ${route}`,
              operation: operation as Record<string, unknown>,
            },
          ]
        : [];
    }),
  );
}

describe('withDefaultErrorResponses', () => {
  const ref = { $ref: `#/components/schemas/${ERROR_RESPONSE_SCHEMA}` };

  it('adds the shared error response to every operation that has none', () => {
    const document = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {
        '/v1/a': { get: { responses: { 200: { description: 'ok' } } } },
        '/v1/b': {
          post: { responses: { 201: { description: 'made' }, default: { description: 'mine' } } },
        },
      },
    } as unknown as OpenAPIObject;

    const result = withDefaultErrorResponses(document);

    expect(result.paths['/v1/a']?.get?.responses).toEqual({
      200: { description: 'ok' },
      default: {
        description: 'Error: `{ code, message, details }`',
        content: { 'application/json': { schema: ref } },
      },
    });
    // An operation that documents its own default keeps it.
    expect(result.paths['/v1/b']?.post?.responses.default).toEqual({ description: 'mine' });
  });
});

describe('OpenAPI document (B502 contract)', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(testConfig())],
    }).compile();
    app = configureApp(moduleRef.createNestApplication({ logger: false }));
    document = buildOpenApiDocument(app);
  });

  afterAll(() => app.close());

  it('describes the Tablz API as OpenAPI 3', () => {
    expect(document.openapi).toMatch(/^3\./);
    expect(document.info).toMatchObject({ title: 'Tablz API', version: '1' });
  });

  it('versions every route under /v1', () => {
    const routes = Object.keys(document.paths);
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) expect(route).toMatch(/^\/v1(\/|$)/);
  });

  it('has unique operationIds (they are the generated client method names)', () => {
    const ids = operations(document).map(({ operation }) => String(operation.operationId));
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect(duplicates).toEqual([]);
  });

  it('gives every operation an operationId, a tag, a success response and the error response', () => {
    for (const { route, operation } of operations(document)) {
      const responses = operation.responses as Record<string, unknown>;
      expect({ route, operationId: typeof operation.operationId }).toEqual({
        route,
        operationId: 'string',
      });
      expect({ route, tags: (operation.tags as string[] | undefined)?.length ?? 0 }).not.toEqual({
        route,
        tags: 0,
      });
      expect({ route, success: Object.keys(responses).some((s) => /^2\d\d$/.test(s)) }).toEqual({
        route,
        success: true,
      });
      expect({ route, default: responses.default !== undefined }).toEqual({ route, default: true });
    }
  });

  it('defines the one error shape as a schema', () => {
    expect(document.components?.schemas?.[ERROR_RESPONSE_SCHEMA]).toMatchObject({
      type: 'object',
      required: ['code', 'message', 'details'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: { type: 'object' },
      },
    });
  });

  it('documents GET /v1 with its response schema', () => {
    const get = document.paths['/v1']?.get;
    expect(get?.operationId).toBe('getApiInfo');
    expect(get?.responses[200]).toMatchObject({
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiInfoDto' } } },
    });
  });

  it('matches the committed openapi.json (run `npm run openapi:generate` after changing a route or DTO)', () => {
    const committed = readFileSync(path.join(__dirname, '..', '..', OPENAPI_FILE), 'utf8');
    expect(serializeOpenApi(document)).toBe(committed);
  });
});
