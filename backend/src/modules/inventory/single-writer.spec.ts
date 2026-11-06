import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// CLAUDE.md rule 3 / B701 quality guideline: no code path but the ledger service writes
// branch_stock.current_stock. The demo seed is the one documented exception (ADR 0016).
// Reading it (`currentStock: true` in a select) is fine; anything else assigning it is a write.

const SRC = path.join(__dirname, '..', '..');
const ALLOWED = new Set([
  path.join('modules', 'inventory', 'ledger.service.ts'),
  path.join('prisma', 'seed', 'build-seed.ts'),
]);
const WRITE = /\bcurrentStock\s*:\s*(?!true\b)/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === 'generated' ? [] : sourceFiles(full);
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [full] : [];
  });
}

describe('single stock writer (rule 3)', () => {
  it('only the ledger service and the seed assign currentStock', () => {
    const writers = sourceFiles(SRC)
      .filter((file) => WRITE.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file));
    expect(writers.sort()).toEqual([...ALLOWED].sort());
  });
});
