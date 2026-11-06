import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = configureApp(await NestFactory.create(AppModule));
  // B501 replaces this with the validated config module.
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
