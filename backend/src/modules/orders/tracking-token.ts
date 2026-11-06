import { createHash, randomBytes } from 'node:crypto';
import { Injectable, type PipeTransform } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception';

/** 32 random bytes in base64url: exactly 43 characters. */
export const TRACKING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** ADR 0008: the token is returned once at checkout; only its sha256 (hex) is stored. */
export function hashTrackingToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newTrackingToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashTrackingToken(token) };
}

/**
 * Validates the `:token` path parameter. A malformed token answers like an unknown one
 * (404 ORDER_NOT_FOUND), so the response never hints at the token's shape or existence.
 */
@Injectable()
export class TrackingTokenPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!TRACKING_TOKEN_PATTERN.test(value)) {
      throw new AppException(404, 'ORDER_NOT_FOUND', 'No such order.');
    }
    return value;
  }
}
