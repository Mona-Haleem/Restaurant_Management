// Writes the OpenAPI contract to backend/openapi.json. Run with `npm run openapi:generate`.
// Builds the app without starting a server or touching a database.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { configureApp } from '../app.setup';
import { buildOpenApiDocument, OPENAPI_FILE, serializeOpenApi } from './openapi';

async function generate(): Promise<void> {
  const app = configureApp(
    await NestFactory.create(
      AppModule.register({
        appEnv: 'test',
        port: 0,
        databaseUrl: 'postgresql://unused@localhost/unused',
        directUrl: undefined,
        corsOrigins: [],
        logLevel: 'silent',
        rateLimit: { max: 1, windowSeconds: 1 },
        gitCommit: null,
        databasePoolMax: 1,
      }),
      { logger: false },
    ),
  );
  const file = path.join(__dirname, '..', '..', OPENAPI_FILE);
  writeFileSync(file, serializeOpenApi(buildOpenApiDocument(app)));
  await app.close();
  process.stdout.write(`Wrote ${file}\n`);
}

void generate();
