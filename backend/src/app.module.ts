import { Module, type DynamicModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import { AppController } from './app.controller';
import { CommonModule } from './common/common.module';
import { RateLimitModule } from './common/http/rate-limit';
import { buildLoggerOptions } from './common/logging/logger-options';
import type { AppConfig } from './config/app-config';
import { AppConfigModule } from './config/config.module';
import { ContextModule } from './context/context.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

export interface AppModuleOptions {
  /** Tests pass a stream to read the structured log lines. */
  logStream?: DestinationStream;
}

@Module({})
export class AppModule {
  /** The app is always built from an already-validated config (see main.ts / loadConfig). */
  static register(config: AppConfig, options: AppModuleOptions = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AppConfigModule.forRoot(config),
        LoggerModule.forRoot(buildLoggerOptions(config, options.logStream)),
        CommonModule,
        // Guards run in this order: rate limit first, then tenant context and access.
        RateLimitModule,
        PrismaModule,
        ContextModule,
        HealthModule,
      ],
      controllers: [AppController],
    };
  }
}
