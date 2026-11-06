import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaContextLookup } from './context-lookup';
import { ContextController } from './context.controller';
import { DevHeaderContextProvider } from './dev-header-context.provider';
import { RequestContextInterceptor } from './request-context.interceptor';
import { REQUEST_CONTEXT_PROVIDER } from './request-context.provider';
import { TenantAccessGuard } from './tenant-access.guard';

/**
 * Request context and the auth seam (ARCHITECTURE §3). Phase 2 replaces only the
 * REQUEST_CONTEXT_PROVIDER binding below with a JWT provider.
 */
@Module({
  controllers: [ContextController],
  providers: [
    PrismaContextLookup,
    {
      provide: REQUEST_CONTEXT_PROVIDER,
      inject: [PrismaContextLookup],
      useFactory: (lookup: PrismaContextLookup) => new DevHeaderContextProvider(lookup),
    },
    { provide: APP_GUARD, useClass: TenantAccessGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
  ],
})
export class ContextModule {}
