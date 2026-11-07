import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { findDestructiveStatements, LAST_UNCHECKED_MIGRATION } from './migration-safety';

// B1202 quality guideline: migrations are backward-compatible for one release (add before you
// remove), because the old code runs briefly against the new schema. A destructive statement
// must be the deliberate "contract" half of an expand/contract change, marked as such.

const MIGRATIONS = path.join(__dirname, '..', '..', 'prisma', 'migrations');

describe('findDestructiveStatements', () => {
  it.each([
    ['DROP TABLE "orders";'],
    ['ALTER TABLE "orders" DROP COLUMN "note";'],
    ['ALTER TABLE "orders" RENAME COLUMN "note" TO "remark";'],
    ['ALTER TABLE "orders" RENAME TO "sales";'],
    ['ALTER TABLE "orders" ALTER COLUMN "total" SET DATA TYPE INTEGER;'],
    ['ALTER TABLE "orders" ALTER COLUMN "note" TYPE TEXT;'],
    ['ALTER TABLE "orders" ALTER COLUMN "note" SET NOT NULL;'],
    ['DROP INDEX "orders_x_idx";\nDROP TYPE "unit";'],
    ["ALTER TYPE \"unit\" RENAME VALUE 'G' TO 'GRAM';"],
    // The classic expand mistake Prisma generates: old code's inserts would fail.
    ['ALTER TABLE "orders" ADD COLUMN "channel" TEXT NOT NULL;'],
    ['ALTER TABLE "orders" ALTER COLUMN "note" DROP DEFAULT;'],
    ['DROP MATERIALIZED VIEW "daily";'],
    ['DROP FUNCTION "f"();'],
    ['DROP TRIGGER "t" ON "orders";'],
    ['DROP SEQUENCE "s";'],
  ])('flags %p', (sql) => {
    expect(findDestructiveStatements(sql).length).toBeGreaterThan(0);
  });

  it.each([
    ['CREATE TABLE "x" ("id" UUID PRIMARY KEY);'],
    ['ALTER TABLE "orders" ADD COLUMN "note2" TEXT;'],
    ['CREATE INDEX "orders_y_idx" ON "orders"("tenant_id");'],
    ['ALTER TABLE "orders" ADD CONSTRAINT "c" CHECK ("total" >= 0);'],
    ['-- DROP TABLE "old"; is only a comment here\nCREATE TABLE "y" ("id" INT);'],
    ['ALTER TYPE "unit" ADD VALUE \'OZ\';'],
    ['ALTER TABLE "orders" ADD COLUMN "channel" TEXT NOT NULL DEFAULT \'pos\';'],
    ['ALTER TABLE "orders" ALTER COLUMN "note" DROP NOT NULL;'],
  ])('allows %p', (sql) => {
    expect(findDestructiveStatements(sql)).toEqual([]);
  });

  it('allows a destructive statement in a migration marked as a contract step', () => {
    const sql =
      '-- contract step: the app stopped reading "note" in the previous release (ADR 0029)\n' +
      'ALTER TABLE "orders" DROP COLUMN "note";';
    expect(findDestructiveStatements(sql)).toEqual([]);
  });

  it('honours the contract marker only at the start of the migration', () => {
    const sql =
      'ALTER TABLE "orders" DROP COLUMN "note";\n-- contract step: written too late to count\n';
    expect(findDestructiveStatements(sql).length).toBeGreaterThan(0);
  });
});

describe('committed migrations (B1202)', () => {
  const folders = readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  it('knows the last migration written before this check existed', () => {
    expect(folders).toContain(LAST_UNCHECKED_MIGRATION);
  });

  it('every newer migration is backward-compatible for one release, or marked as a contract step', () => {
    const problems = folders
      .filter((name) => name > LAST_UNCHECKED_MIGRATION)
      .flatMap((name) =>
        findDestructiveStatements(
          readFileSync(path.join(MIGRATIONS, name, 'migration.sql'), 'utf8'),
        ).map((problem) => `${name}: ${problem}`),
      );
    expect(problems).toEqual([]);
  });
});
