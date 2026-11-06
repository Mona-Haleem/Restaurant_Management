import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { runBootGuards } from './config/boot-guard';
import { EnvironmentGuardError } from './config/environment';
import { envFileHint, loadEnvFiles } from './config/load-env';

async function bootstrap(): Promise<void> {
  // backend/ (dist/main.js lives in backend/dist), whatever folder the process started in.
  const hint = envFileHint(loadEnvFiles(path.join(__dirname, '..')), process.env);
  if (hint) process.stderr.write(`\n! ${hint}\n`);
  await runBootGuards(process.env);

  const app = configureApp(await NestFactory.create(AppModule));
  // B501 replaces this with the validated config module.
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  if (error instanceof EnvironmentGuardError) {
    process.stderr.write(`\n✖ Refusing to start: ${error.message}\n\n`);
    process.exit(1);
  }
  throw error;
});
