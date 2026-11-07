/**
 * B1202 quality guideline (ADR 0029): during a deploy the previous release briefly runs against the
 * new schema, so a migration may only add. Removing or changing something is the "contract" half of
 * an expand/contract change, shipped one release after the code stopped using it, and its migration
 * says so with a `-- contract step:` comment.
 */

/** Migrations up to this one were committed before the check existed; they are not re-judged. */
export const LAST_UNCHECKED_MIGRATION = '20261107082240_b1101_history_stage_time_idx';

/** The migration must start with it: only leading whitespace may come before the marker. */
const CONTRACT_MARKER = /^\s*--\s*contract step:/i;

const DESTRUCTIVE: { pattern: RegExp; what: string }[] = [
  // Any DROP (table, column, view, function, trigger, sequence, extension, default…), except
  // DROP NOT NULL, which only relaxes a column.
  { pattern: /\bDROP\b(?!\s+NOT\s+NULL\b)/i, what: 'drops something' },
  // A new required column without a default breaks the old code's inserts.
  {
    pattern: /\bADD\s+(COLUMN\s+)?"?\w+"?\s+[^,]*\bNOT\s+NULL\b(?![^,]*\bDEFAULT\b)/i,
    what: 'adds a required column without a default',
  },
  { pattern: /\bRENAME\b/i, what: 'renames something' },
  {
    pattern: /\bALTER\s+COLUMN\s+"?\w+"?\s+(SET\s+DATA\s+)?TYPE\b/i,
    what: 'changes a column type',
  },
  { pattern: /\bALTER\s+COLUMN\s+"?\w+"?\s+SET\s+NOT\s+NULL\b/i, what: 'makes a column required' },
  { pattern: /\bTRUNCATE\b|\bDELETE\s+FROM\b/i, what: 'removes rows' },
];

/** Strips `--` line comments and `/* *\/` blocks so commented-out SQL is not judged. */
function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--.*$/gm, ' ');
}

/** Each destructive statement found, described for a test failure; empty when the SQL only adds. */
export function findDestructiveStatements(sql: string): string[] {
  if (CONTRACT_MARKER.test(sql)) return [];
  return stripComments(sql)
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement !== '')
    .flatMap((statement) =>
      DESTRUCTIVE.filter((d) => d.pattern.test(statement)).map(
        (d) => `${d.what}: ${statement.replace(/\s+/g, ' ').slice(0, 120)}`,
      ),
    );
}
