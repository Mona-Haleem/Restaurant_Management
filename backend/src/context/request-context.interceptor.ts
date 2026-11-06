import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { RequestContext } from './request-context';
import { RequestContextStore } from './request-context.store';

/** Runs the handler inside the request's context, so services and TENANT_DB can read it. */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  constructor(private readonly store: RequestContextStore) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp().getRequest<{ tablzContext?: RequestContext }>().tablzContext;
    if (!ctx) return next.handle();
    return new Observable((subscriber) =>
      this.store.run(ctx, () => next.handle().subscribe(subscriber)),
    );
  }
}
