import argon2 from 'argon2';

/**
 * Hashes a staff password with argon2id (library defaults: 64 MiB, t=3, p=4). Phase 1 stores the
 * hash only; login and `argon2.verify` arrive with JWT in Phase 2 (ARCHITECTURE §1).
 */
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}
