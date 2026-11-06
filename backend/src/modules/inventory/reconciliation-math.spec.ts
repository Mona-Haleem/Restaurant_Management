import { parseDecimal } from '../../common/decimal/decimal';
import { expectedStock } from './ledger-math';
import { reconcileCount, StockCacheMismatchError } from './reconciliation-math';

// B902: the gap is counted − expected, where expected = latest snapshot + every ledger row since
// (ARCHITECTURE §5). Logged waste is already a WASTE row in the ledger, so it is never part of it.

const D = parseDecimal;

describe('reconcileCount', () => {
  // Quality guideline (ROADMAP B902): this test comes before the calculation.
  it('flags zero when the only loss was waste that was already logged', () => {
    const expected = expectedStock(D('10'), [D('-2')]); // snapshot 10, logged waste 2
    const result = reconcileCount({ counted: D('8'), expected, currentStock: D('8') });
    expect(result.gap.toFixed(3)).toBe('0.000');
    expect(result.flagged).toBe(false);
  });

  it('flags only the unexplained part when waste was logged and more went missing', () => {
    const expected = expectedStock(D('10'), [D('-2'), D('-1.5')]); // waste 2, an order 1.5
    const result = reconcileCount({ counted: D('6'), expected, currentStock: D('6.5') });
    expect(result.gap.toFixed(3)).toBe('-0.500');
    expect(result.flagged).toBe(true);
  });

  it('flags a surplus as a positive gap', () => {
    const result = reconcileCount({ counted: D('3.25'), expected: D('3'), currentStock: D('3') });
    expect(result.gap.toFixed(3)).toBe('0.250');
    expect(result.flagged).toBe(true);
  });

  it('closes a negative expected stock (ADR 0006) up to the count', () => {
    const result = reconcileCount({
      counted: D('0'),
      expected: D('-1.2'),
      currentStock: D('-1.2'),
    });
    expect(result.gap.toFixed(3)).toBe('1.200');
  });

  it('treats an equal count with a different scale as no gap', () => {
    const result = reconcileCount({
      counted: D('2.500'),
      expected: D('2.5'),
      currentStock: D('2.5'),
    });
    expect(result.flagged).toBe(false);
  });

  it('refuses when the cached stock disagrees with the ledger (an invariant break, not a gap)', () => {
    expect(() =>
      reconcileCount({ counted: D('5'), expected: D('5'), currentStock: D('4') }),
    ).toThrow(StockCacheMismatchError);
  });

  it('holds for random sequences: counted − (snapshot + deltas) is the gap, waste never adds to it', () => {
    let seed = 902;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const dec = () => D(String(Math.floor(rand() * 10_000))).dividedBy(1000);
    for (let i = 0; i < 200; i++) {
      const snapshot = dec();
      const deltas = Array.from({ length: Math.floor(rand() * 8) }, () =>
        rand() < 0.5 ? dec().negated() : dec(),
      );
      const wasteLogged = dec().negated();
      const missing = dec();
      const expected = expectedStock(snapshot, [...deltas, wasteLogged]);
      const counted = expected.minus(missing);
      if (counted.isNegative()) continue;
      const result = reconcileCount({ counted, expected, currentStock: expected });
      expect(result.gap.equals(missing.negated())).toBe(true);
    }
  });
});
