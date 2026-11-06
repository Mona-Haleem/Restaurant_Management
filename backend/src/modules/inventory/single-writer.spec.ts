import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// CLAUDE.md rule 3 / B701 quality guideline: no code path but the ledger service writes
// branch_stock.current_stock. The demo seed's writer is the one documented exception (ADR 0016).
// Reading stock (selects, filters, response DTOs named `currentStock`) is fine; a write is:
// - any Prisma write call on branchStock (create/update/upsert, including the *Many forms),
// - an atomic operator on currentStock (`currentStock: { increment: … }` and friends),
// - raw SQL that mentions current_stock.

const SRC = path.join(__dirname, '..', '..');
const ALLOWED = new Set([
  path.join('modules', 'inventory', 'ledger.service.ts'),
  path.join('prisma', 'seed', 'write-seed.ts'),
]);
const WRITES = [
  /\bbranchStock\s*\.\s*(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert)\s*\(/,
  /\bcurrentStock\s*:\s*\{\s*(increment|decrement|set|multiply|divide)\b/,
  /\$(executeRaw|queryRaw)(Unsafe)?[\s\S]{0,400}\bcurrent_stock\b/,
  // A nested write through a relation (e.g. inventoryItem.update({ data: { stock: { update } } })).
  // The scoped client refuses nested writes at run time (ADR 0018); this catches them in review.
  /\b(branchStock|stock)\s*:\s*\{\s*(create|createMany|update|updateMany|upsert|connectOrCreate)\b/,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === 'generated' ? [] : sourceFiles(full);
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [full] : [];
  });
}

describe('single stock writer (rule 3)', () => {
  it('only the ledger service and the seed writer write branch_stock', () => {
    const writers = sourceFiles(SRC)
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return WRITES.some((pattern) => pattern.test(source));
      })
      .map((file) => path.relative(SRC, file));
    expect(writers.sort()).toEqual([...ALLOWED].sort());
  });

  it('recognises each kind of write (so the guard cannot silently stop matching)', () => {
    const samples = [
      'await tx.branchStock.update({ where, data: {} })',
      'db.branchStock.createMany({ data })',
      'data: { currentStock: { decrement: 2 } }',
      'await tx.$executeRaw`UPDATE branch_stock SET current_stock = 0`',
      'data: { stock: { update: { where, data: { lowStockThreshold: x } } } }',
    ];
    for (const sample of samples) {
      expect({ sample, matched: WRITES.some((p) => p.test(sample)) }).toEqual({
        sample,
        matched: true,
      });
    }
    const reads = [
      'select: { currentStock: true }',
      'currentStock: formatDecimal(current, QUANTITY),',
      'db.branchStock.findMany({ where })',
    ];
    for (const sample of reads) {
      expect({ sample, matched: WRITES.some((p) => p.test(sample)) }).toEqual({
        sample,
        matched: false,
      });
    }
  });
});
