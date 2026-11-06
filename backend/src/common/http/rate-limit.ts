import { Injectable, Module, type ExecutionContext } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, type ThrottlerLimitDetail } from '@nestjs/throttler';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { AppException } from '../errors/app-exception';

/** Throttler's guard, answering in the shared error shape (ARCHITECTURE §7). */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override throwThrottlingException(
    _context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw new AppException(429, 'RATE_LIMITED', 'Too many requests. Try again shortly.', {
      retryAfterSeconds: detail.timeToBlockExpire,
    });
  }
}

/**
 * B503: a per-IP limit on every route (`RATE_LIMIT_MAX` requests per `RATE_LIMIT_WINDOW_SECONDS`).
 * Health routes opt out with @SkipThrottle. In-memory: one Render instance in Phase 1.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        throttlers: [{ ttl: config.rateLimit.windowSeconds * 1000, limit: config.rateLimit.max }],
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class RateLimitModule {}
