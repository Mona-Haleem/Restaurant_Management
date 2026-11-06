import type { Prisma } from '../../generated/prisma/client';
import { parseDecimal } from '../../common/decimal/decimal';
import {
  expandOrder,
  expectedStock,
  type LedgerMathError,
  nextAverageCost,
  type ComponentLine,
  type RecipeLine,
  type StockItem,
} from './ledger-math';

// ARCHITECTURE §5 / ADR 0002 / ADR 0005, as pure functions. The ledger service and the demo seed
// both use them, so the two can never disagree about what an order consumes.

type Decimal = Prisma.Decimal;
// Integers in the fixtures are written as numbers for brevity; parsed from their string form.
const D = (v: string | number): Decimal => parseDecimal(String(v));

const items = new Map<string, StockItem>([
  ['beef', { id: 'beef', type: 'RAW', unit: 'KG' }],
  ['buns', { id: 'buns', type: 'READY', unit: 'PCS' }],
  ['garlic', { id: 'garlic', type: 'RAW', unit: 'KG' }],
  ['oil', { id: 'oil', type: 'RAW', unit: 'L' }],
  ['sauce', { id: 'sauce', type: 'MIXED', unit: 'L' }],
  ['meta', { id: 'meta', type: 'MIXED', unit: 'L' }],
]);
const line = (inventoryItemId: string, quantity: string, unit: RecipeLine['unit']): RecipeLine => ({
  inventoryItemId,
  quantity: D(quantity),
  unit,
});
const component = (
  componentItemId: string,
  quantity: string,
  unit: ComponentLine['unit'],
): ComponentLine => ({ componentItemId, quantity: D(quantity), unit });

const recipes = new Map<string, RecipeLine[]>([
  // 150 G beef, 1 bun, 30 ML sauce
  ['burger', [line('beef', '150', 'G'), line('buns', '1', 'PCS'), line('sauce', '30', 'ML')]],
  // 10 ML oil directly, plus 50 ML sauce (which also contains oil)
  ['fries', [line('oil', '10', 'ML'), line('sauce', '50', 'ML')]],
  ['water', []],
]);
const components = new Map<string, ComponentLine[]>([
  // per 1 L of sauce
  ['sauce', [component('garlic', '0.2', 'KG'), component('oil', '200', 'ML')]],
  ['meta', [component('sauce', '1', 'L')]],
]);

const asStrings = (totals: Map<string, Decimal>): Record<string, string> =>
  Object.fromEntries([...totals].map(([k, v]) => [k, v.toString()]));

describe('expandOrder (ADR 0002: one level, aggregated per item)', () => {
  it('converts every line to the stock unit and multiplies by the ordered quantity', () => {
    const totals = expandOrder([{ menuItemId: 'burger', quantity: 2 }], recipes, items, components);
    expect(asStrings(totals)).toEqual({
      beef: '0.3', // 2 x 150 G
      buns: '2',
      garlic: '0.012', // 2 x 0.03 L x 0.2 KG/L
      oil: '0.012', // 2 x 0.03 L x 0.2 L/L
    });
  });

  it('never lists the MIXED item itself', () => {
    const totals = expandOrder([{ menuItemId: 'burger', quantity: 1 }], recipes, items, components);
    expect(totals.has('sauce')).toBe(false);
  });

  it('aggregates an item used directly and through a sauce into one total', () => {
    // fries: 10 ML oil + 50 ML sauce x 0.2 = 0.01 + 0.01 = 0.02 L
    const totals = expandOrder([{ menuItemId: 'fries', quantity: 1 }], recipes, items, components);
    expect(asStrings(totals)).toEqual({ oil: '0.02', garlic: '0.01' });
  });

  it('aggregates across order lines', () => {
    const totals = expandOrder(
      [
        { menuItemId: 'burger', quantity: 1 },
        { menuItemId: 'fries', quantity: 2 },
        { menuItemId: 'burger', quantity: 1 },
      ],
      recipes,
      items,
      components,
    );
    expect(asStrings(totals)).toEqual({ beef: '0.3', buns: '2', garlic: '0.032', oil: '0.052' });
  });

  it('returns nothing for items without a recipe', () => {
    expect(
      expandOrder([{ menuItemId: 'water', quantity: 3 }], recipes, items, components).size,
    ).toBe(0);
    expect(
      expandOrder([{ menuItemId: 'ghost', quantity: 1 }], recipes, items, components).size,
    ).toBe(0);
  });

  it('refuses a MIXED component (one level only)', () => {
    const nested = new Map(recipes).set('special', [line('meta', '1', 'L')]);
    expect(() =>
      expandOrder([{ menuItemId: 'special', quantity: 1 }], nested, items, components),
    ).toThrow(expect.objectContaining({ code: 'MIXED_COMPONENT_IS_MIXED' }) as LedgerMathError);
  });

  it('refuses an amount that needs more than 3 decimals in the stock unit (ADR 0013)', () => {
    const precise = new Map(components).set('sauce', [component('garlic', '0.2003', 'KG')]);
    expect(() =>
      expandOrder([{ menuItemId: 'burger', quantity: 1 }], recipes, items, precise),
    ).toThrow(expect.objectContaining({ code: 'QUANTITY_TOO_PRECISE' }) as LedgerMathError);
  });

  it('refuses a unit from another dimension and an unknown inventory item', () => {
    const wrong = new Map(recipes).set('odd', [line('buns', '5', 'G')]);
    expect(() =>
      expandOrder([{ menuItemId: 'odd', quantity: 1 }], wrong, items, components),
    ).toThrow(expect.objectContaining({ code: 'UNIT_DIMENSION_MISMATCH' }) as LedgerMathError);
    const ghost = new Map(recipes).set('odd', [line('nope', '5', 'G')]);
    expect(() =>
      expandOrder([{ menuItemId: 'odd', quantity: 1 }], ghost, items, components),
    ).toThrow(expect.objectContaining({ code: 'INVENTORY_ITEM_NOT_FOUND' }) as LedgerMathError);
  });
});

describe('nextAverageCost (ADR 0005, rounded half-up to 4 decimals per ADR 0013)', () => {
  it('starts at the purchase cost on a first purchase', () => {
    expect(nextAverageCost(D(0), null, D(10), D('420')).toString()).toBe('420');
  });

  it('weights the old average by the stock on hand', () => {
    // (20 x 420 + 10 x 440) / 30 = 426.6666… → 426.6667
    expect(nextAverageCost(D(20), D(420), D(10), D(440)).toFixed(4)).toBe('426.6667');
  });

  it('resets to the purchase cost when stock is zero or negative (ADR 0006)', () => {
    expect(nextAverageCost(D(0), D(420), D(5), D(400)).toString()).toBe('400');
    expect(nextAverageCost(D(-3), D(420), D(5), D(400)).toString()).toBe('400');
  });

  it('rounds half-up at the 4th decimal', () => {
    // (0.0001 + 0.0002) / 2 = 0.00015 → 0.0002 ; (3 x 1 + 1.0002) / 4 = 1.00005 → 1.0001
    expect(nextAverageCost(D(1), D('0.0001'), D(1), D('0.0002')).toFixed(4)).toBe('0.0002');
    expect(nextAverageCost(D(3), D('1'), D(1), D('1.0002')).toFixed(4)).toBe('1.0001');
  });
});

/** Mulberry32: a tiny seeded PRNG, so the randomized test is reproducible. */
function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('expectedStock (ARCHITECTURE §5: latest snapshot + transactions since)', () => {
  it('is the snapshot plus every delta after it, or the sum of all deltas with no snapshot', () => {
    expect(expectedStock(null, [D('5'), D('-1.25')]).toString()).toBe('3.75');
    expect(expectedStock(D('2'), [D('-0.5')]).toString()).toBe('1.5');
    expect(expectedStock(D('2'), []).toString()).toBe('2');
  });

  it.each([1, 7, 42, 2024, 99_991])(
    'matches a running total over a randomized sequence that crosses zero (seed %i)',
    (seed) => {
      const random = prng(seed);
      // Deltas in thousandths, as the ledger stores them; never JS number math on the values.
      const deltas: Decimal[] = [];
      let running = D(0);
      let snapshot: { quantity: Decimal; at: number } | null = null;
      for (let i = 0; i < 300; i += 1) {
        const roll = random();
        if (roll < 0.1) {
          // A count: the snapshot records the stock right now (gap already applied as a delta).
          snapshot = { quantity: running, at: deltas.length };
          continue;
        }
        const thousandths = Math.floor(random() * 20_000) - (roll < 0.6 ? 14_000 : 4_000);
        const delta = D(thousandths).dividedBy(1000);
        if (delta.isZero()) continue;
        deltas.push(delta);
        running = running.plus(delta);
      }
      const since = snapshot ? deltas.slice(snapshot.at) : deltas;
      expect(expectedStock(snapshot?.quantity ?? null, since).toString()).toBe(running.toString());
      expect(deltas.some((d) => d.isNegative())).toBe(true);
    },
  );
});
