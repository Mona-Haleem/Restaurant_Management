/**
 * B1204 (ADR 0031): the checks behind the restore drill. A backup carries `counts.tsv`, the exact
 * row count of every `public` table at dump time (`scripts/backup/table-counts.sql`). After a
 * restore the same query runs on the restored database and every count must match.
 */

/** The one database a restore may drop and recreate. Never tablz_dev or tablz_test. */
export const RESTORE_DATABASE = 'tablz_restore';

export class CountsFormatError extends Error {}

/** Parses `table<TAB>count` lines (psql -At -F '\t' output) into an ordered map. */
export function parseCounts(text: string): Map<string, bigint> {
  const counts = new Map<string, bigint>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') continue;
    const [table, count, ...rest] = line.split('\t');
    if (!table || count === undefined || rest.length > 0 || !/^\d+$/.test(count)) {
      throw new CountsFormatError(`counts: cannot read the line "${line}".`);
    }
    if (counts.has(table)) throw new CountsFormatError(`counts: ${table} is listed twice.`);
    counts.set(table, BigInt(count));
  }
  if (counts.size === 0) throw new CountsFormatError('counts: no table listed.');
  return counts;
}

export interface CountRow {
  table: string;
  /** null: the backup did not have this table. */
  expected: bigint | null;
  /** null: the restored database does not have this table. */
  actual: bigint | null;
  ok: boolean;
}

/** Every table of either side, sorted by name; ok only when all of them match exactly. */
export function compareCounts(
  expected: ReadonlyMap<string, bigint>,
  actual: ReadonlyMap<string, bigint>,
): { ok: boolean; rows: CountRow[] } {
  const tables = [...new Set([...expected.keys(), ...actual.keys()])].sort();
  const rows = tables.map((table) => {
    const e = expected.get(table) ?? null;
    const a = actual.get(table) ?? null;
    return { table, expected: e, actual: a, ok: e !== null && a !== null && e === a };
  });
  return { ok: rows.every((r) => r.ok), rows };
}

/** The restore drops and recreates its target, so it may only ever be the scratch database. */
export function assertRestoreDatabase(name: string): void {
  if (name !== RESTORE_DATABASE) {
    throw new Error(
      `A restore only goes into "${RESTORE_DATABASE}" (it drops and recreates it), not "${name}".`,
    );
  }
}
