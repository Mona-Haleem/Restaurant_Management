import { Module, type DynamicModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import { AppController } from './app.controller';
import { CommonModule } from './common/common.module';
import { buildLoggerOptions } from './common/logging/logger-options';
import type { AppConfig } from './config/app-config';
import { AppConfigModule } from './config/config.module';

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
      ],
      controllers: [AppController],
    };
  }
}
