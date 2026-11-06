import argon2 from 'argon2';
import { hashPassword } from './password';

describe('hashPassword', () => {
  it('stores an argon2id hash that verifies, never the plain text', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('correct horse battery');
    await expect(argon2.verify(hash, 'correct horse battery')).resolves.toBe(true);
    await expect(argon2.verify(hash, 'wrong password')).resolves.toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same-password')).not.toBe(await hashPassword('same-password'));
  });
});
