import { Global, Module } from '@nestjs/common';
import { RequestContextStore } from '../context/request-context.store';
import { PrismaService } from './prisma.service';
import { createTenantClient, TENANT_DB } from './tenant-prisma';

/**
 * Database access for the whole app. TENANT_DB reads the tenant from the request context store,
 * which lives here too so the scoped client and the context module share one instance.
 */
@Global()
@Module({
  providers: [
    PrismaService,
    RequestContextStore,
    {
      provide: TENANT_DB,
      inject: [PrismaService, RequestContextStore],
      useFactory: (prisma: PrismaService, store: RequestContextStore) =>
        createTenantClient(prisma, () => store.require().tenantId),
    },
  ],
  exports: [PrismaService, RequestContextStore, TENANT_DB],
})
export class PrismaModule {}
