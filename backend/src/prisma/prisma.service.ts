import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { PrismaClient } from '../generated/prisma/client';

/**
 * The unscoped client. Only platform code (request context, health) uses it directly; feature
 * modules get the tenant-scoped client (TENANT_DB) and ESLint forbids importing this one there.
 * Connects lazily on the first query, so the app boots even when the database is down and
 * `/v1/health/db` can report it.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({
      adapter: new PrismaPg({
        connectionString: config.databaseUrl,
        connectionTimeoutMillis: 3_000,
        // Many serverless instances share the Supabase pooler: keep each one small (ADR 0028).
        max: config.databasePoolMax,
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
