/**
 * CORS allowlist (ROADMAP B501). Entries are exact origins, or an origin with one `*` inside the
 * first label of the host, for Vercel preview URLs such as https://tablz-*-team.vercel.app.
 * `*` alone, or a wildcard spanning a whole shared domain (https://*.vercel.app), is refused.
 *
 * The `*` matches letters and digits only, never `-`: Vercel's hash URLs (tablz-abc123-team)
 * match, but another account whose scope merely ends in "-team" (tablz-x-evil-team) does not.
 * Branch aliases with hyphens (tablz-git-feat-x-team) must be listed exactly.
 */

const ORIGIN_SHAPE = /^(https?):\/\/([a-z0-9*.-]+)(:\d{1,5})?$/;
const WILDCARD_LABEL = '[a-z0-9]+';

export function isOriginPatternValid(entry: string): boolean {
  const match = ORIGIN_SHAPE.exec(entry.toLowerCase());
  if (!match) return false;
  const host = match[2] ?? '';
  const stars = host.split('*').length - 1;
  if (stars === 0) return true;
  const [firstLabel = '', ...rest] = host.split('.');
  return stars === 1 && firstLabel.includes('*') && firstLabel !== '*' && rest.length >= 2;
}

function toRegExp(entry: string): RegExp {
  const escaped = entry.toLowerCase().replace(/[.+?^${}()|[\]\\/]/g, '\\$&');
  return new RegExp(`^${escaped.replace('*', WILDCARD_LABEL)}$`);
}

/** `undefined` means no Origin header (same-origin, curl, health checks): CORS does not apply. */
export function isOriginAllowed(origin: string | undefined, allowlist: readonly string[]): boolean {
  if (origin === undefined) return true;
  const candidate = origin.toLowerCase();
  return allowlist.some((entry) =>
    entry.includes('*') ? toRegExp(entry).test(candidate) : entry.toLowerCase() === candidate,
  );
}
