import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { loadConfig } from './config/app-config';
import { runBootGuards } from './config/boot-guard';
import { EnvironmentGuardError } from './config/environment';
import { envFileHint, loadEnvFiles } from './config/load-env';

async function bootstrap(): Promise<void> {
  // backend/ (dist/main.js lives in backend/dist), whatever folder the process started in.
  const hint = envFileHint(loadEnvFiles(path.join(__dirname, '..')), process.env);
  if (hint) process.stderr.write(`\n! ${hint}\n`);
  const config = loadConfig(process.env); // fail fast: every config problem, before any I/O
  await runBootGuards(process.env); // the database is the one APP_ENV expects (ADR 0011)

  const app = configureApp(
    await NestFactory.create(AppModule.register(config), { bufferLogs: true }),
  );
  await app.listen(config.port);
}

bootstrap().catch((error: unknown) => {
  // ConfigValidationError extends EnvironmentGuardError.
  if (error instanceof EnvironmentGuardError) {
    process.stderr.write(`\n✖ Refusing to start: ${error.message}\n\n`);
    process.exit(1);
  }
  throw error;
});
//force workflow edit
