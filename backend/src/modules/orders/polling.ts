import { createHash } from 'node:crypto';

/**
 * Cheap polling for the board and tracking (B802, ADR 0024). A response's ETag is a fingerprint
 * of what it would contain, built from an aggregate (how many orders match, and the latest
 * `updated_at` among them) plus the request's scope. A poll whose If-None-Match still matches is
 * answered 304 without loading any order. Pure functions.
 */

export interface Fingerprint {
  /** Who asks and with which filters, e.g. `list:<tenant>:<branch>:active:<stage>`. */
  scope: string;
  count: number;
  latest: Date | null;
  /** Anything else the response depends on (e.g. the workflow stages for tracking). */
  extra?: string[];
}

/** A weak validator: the body is semantically the same when the tag matches (RFC 9110 §8.8.1). */
export function etagFor(f: Fingerprint): string {
  const material = JSON.stringify([
    f.scope,
    f.count,
    f.latest?.toISOString() ?? null,
    f.extra ?? [],
  ]);
  return `W/"${createHash('sha256').update(material).digest('hex').slice(0, 32)}"`;
}

/** RFC 9110 §13.1.2: If-None-Match uses the weak comparison; `*` matches any current entity. */
export function matchesIfNoneMatch(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  if (header.trim() === '*') return true;
  const opaque = (tag: string): string | null => {
    const m = /^(?:W\/)?("[^"]*")$/.exec(tag.trim());
    return m?.[1] ?? null;
  };
  const wanted = opaque(etag);
  return header.split(',').some((candidate) => wanted !== null && opaque(candidate) === wanted);
}

/** The last stage by position (never by key, CLAUDE.md rule 2): orders there are finished. */
export function lastStage<S extends { position: number }>(stages: readonly S[]): S | undefined {
  return stages.reduce<S | undefined>(
    (last, s) => (!last || s.position > last.position ? s : last),
    undefined,
  );
}
