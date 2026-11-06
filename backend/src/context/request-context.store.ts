import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { RequestContext } from './request-context';

/**
 * Holds the current request's context for code that runs below the controller (services and the
 * tenant-scoped Prisma client), without passing it through every call.
 */
@Injectable()
export class RequestContextStore {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, fn: () => T): T {
    return this.storage.run(context, fn);
  }

  get(): RequestContext | undefined {
    return this.storage.getStore();
  }

  require(): RequestContext {
    const context = this.storage.getStore();
    if (!context) {
      throw new Error(
        'There is no request context: tenant-scoped queries only run inside a /v1/:tenantSlug request.',
      );
    }
    return context;
  }
}
