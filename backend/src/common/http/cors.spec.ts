import { isOriginAllowed } from './cors';

describe('isOriginAllowed', () => {
  const allowlist = ['http://localhost:4200', 'https://tablz-*-mona.vercel.app'];

  it.each(['http://localhost:4200', 'https://tablz-abc123-mona.vercel.app'])(
    'allows %s',
    (origin) => {
      expect(isOriginAllowed(origin, allowlist)).toBe(true);
    },
  );

  it.each([
    // Another Vercel account whose scope ends in "-mona": the wildcard never spans a hyphen.
    'https://tablz-x-git-main-evil-mona.vercel.app',
    // Branch aliases have hyphens, so they must be listed exactly.
    'https://tablz-git-feat-menu-mona.vercel.app',
    'http://localhost:4300',
    'https://localhost:4200',
    'http://localhost:4200.evil.com',
    'https://tablz--mona.vercel.app',
    'https://tablz-x.evil-mona.vercel.app',
    'https://evil.com/https://tablz-a-mona.vercel.app',
    'https://tablz-a-mona.vercel.app.evil.com',
    'null',
  ])('refuses %s', (origin) => {
    expect(isOriginAllowed(origin, allowlist)).toBe(false);
  });

  it('allows requests without an Origin header (same-origin, curl, health checks)', () => {
    expect(isOriginAllowed(undefined, allowlist)).toBe(true);
  });
});
