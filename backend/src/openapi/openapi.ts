import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/errors/error-response.dto';
import type { AppConfig } from '../config/app-config';

/** The committed contract, at the backend root. CI fails when it drifts from the code. */
export const OPENAPI_FILE = 'openapi.json';
export const ERROR_RESPONSE_SCHEMA = 'ErrorResponse';
export const OPENAPI_JSON_PATH = 'v1/openapi.json';
export const SWAGGER_UI_PATH = 'v1/docs';

export const HTTP_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
] as const;
const METHODS = HTTP_METHODS;

/**
 * Every operation can fail with the shared error shape, so document it once as each operation's
 * `default` response instead of repeating it on every route.
 */
export function withDefaultErrorResponses(document: OpenAPIObject): OpenAPIObject {
  const result = structuredClone(document);
  for (const item of Object.values(result.paths)) {
    for (const method of METHODS) {
      const operation = item[method];
      if (!operation || operation.responses.default) continue;
      operation.responses.default = {
        description: 'Error: `{ code, message, details }`',
        content: {
          'application/json': {
            schema: { $ref: `#/components/schemas/${ERROR_RESPONSE_SCHEMA}` },
          },
        },
      };
    }
  }
  return result;
}

/** Builds the spec from the controllers' decorators. Call after `setGlobalPrefix`. */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const info = new DocumentBuilder()
    .setTitle('Tablz API')
    .setDescription(
      'Tablz restaurant management API, Backend Phase 1. Every error response is ' +
        '`{ code, message, details }`.',
    )
    .setVersion('1')
    .build();
  const document = SwaggerModule.createDocument(app, info, {
    extraModels: [ErrorResponseDto],
    // operationIds become method names in the generated Angular client: keep them readable.
    operationIdFactory: (_controllerKey, methodKey) => methodKey,
  });
  return withDefaultErrorResponses(document);
}

/** Stable text form, so the committed file only changes when the contract does. */
export function serializeOpenApi(document: OpenAPIObject): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

/** The JSON spec is always served (it is the public contract); the UI only off production. */
export function setupOpenApi(app: INestApplication, config: Pick<AppConfig, 'appEnv'>): void {
  SwaggerModule.setup(SWAGGER_UI_PATH, app, buildOpenApiDocument(app), {
    jsonDocumentUrl: OPENAPI_JSON_PATH,
    raw: ['json'],
    ui: config.appEnv !== 'production',
  });
}
