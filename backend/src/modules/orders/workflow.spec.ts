import { firstStage, planAdvance, planCancel, type WorkflowStage } from './workflow';

// ARCHITECTURE §6 / B801 acceptance: behavior comes from the flags and the position only. The
// fixtures below rename and reorder the stages; the rules must hold for every shape unchanged.

const DEFAULTS: WorkflowStage[] = [
  { key: 'pending', position: 1, cancellable: true, deductsInventory: false },
  { key: 'in-preparation', position: 2, cancellable: false, deductsInventory: false },
  { key: 'ready', position: 3, cancellable: false, deductsInventory: false },
  { key: 'delivered', position: 4, cancellable: false, deductsInventory: true },
];

/** Renamed keys, gaps in the positions, stored out of order, two cancellable stages. */
const CUSTOM: WorkflowStage[] = [
  { key: 'served', position: 30, cancellable: false, deductsInventory: true },
  { key: 'queued', position: 5, cancellable: true, deductsInventory: false },
  { key: 'archived', position: 99, cancellable: false, deductsInventory: true },
  { key: 'cooking', position: 20, cancellable: true, deductsInventory: false },
];

const live = (stageKey: string) => ({ stageKey, canceled: false });

describe('order workflow rules (pure)', () => {
  describe('firstStage', () => {
    it('is the lowest position, whatever the keys or the stored order', () => {
      expect(firstStage(DEFAULTS).key).toBe('pending');
      expect(firstStage(CUSTOM).key).toBe('queued');
      expect(firstStage([...DEFAULTS].reverse()).key).toBe('pending');
    });

    it('refuses a tenant without stages', () => {
      expect(() => firstStage([])).toThrow('no workflow stages');
    });
  });

  describe('planAdvance', () => {
    it('moves to the next position and deducts only when the target stage says so', () => {
      expect(planAdvance(DEFAULTS, live('pending'))).toEqual({
        ok: true,
        to: DEFAULTS[1],
        deducts: false,
      });
      expect(planAdvance(DEFAULTS, live('ready'))).toEqual({
        ok: true,
        to: DEFAULTS[3],
        deducts: true,
      });
    });

    it('follows positions, not storage order or names, in a renamed and reordered config', () => {
      expect(planAdvance(CUSTOM, live('queued'))).toMatchObject({
        ok: true,
        to: { key: 'cooking' },
        deducts: false,
      });
      expect(planAdvance(CUSTOM, live('cooking'))).toMatchObject({
        ok: true,
        to: { key: 'served' },
        deducts: true,
      });
      // A later stage may deduct too: the plan says so; the ledger makes the repeat a no-op.
      expect(planAdvance(CUSTOM, live('served'))).toMatchObject({
        ok: true,
        to: { key: 'archived' },
        deducts: true,
      });
    });

    it('refuses to move past the last stage', () => {
      expect(planAdvance(DEFAULTS, live('delivered'))).toEqual({
        ok: false,
        code: 'ORDER_AT_LAST_STAGE',
      });
      expect(planAdvance(CUSTOM, live('archived'))).toEqual({
        ok: false,
        code: 'ORDER_AT_LAST_STAGE',
      });
    });

    it('refuses a cancelled order', () => {
      expect(planAdvance(DEFAULTS, { stageKey: 'pending', canceled: true })).toEqual({
        ok: false,
        code: 'ORDER_CANCELED',
      });
    });

    it('fails loudly when the order points at a stage the config does not have', () => {
      expect(() => planAdvance(DEFAULTS, live('gone'))).toThrow('not in the workflow');
    });
  });

  describe('planCancel', () => {
    it('is allowed exactly where the current stage is cancellable', () => {
      for (const stages of [DEFAULTS, CUSTOM]) {
        for (const stage of stages) {
          expect(planCancel(stages, live(stage.key))).toEqual(
            stage.cancellable ? { ok: true } : { ok: false, code: 'ORDER_NOT_CANCELLABLE' },
          );
        }
      }
    });

    it('refuses an order that is already cancelled', () => {
      expect(planCancel(DEFAULTS, { stageKey: 'pending', canceled: true })).toEqual({
        ok: false,
        code: 'ORDER_CANCELED',
      });
    });

    it('flipping one flag flips the outcome, with no other change', () => {
      const flipped = DEFAULTS.map((s) => ({ ...s, cancellable: !s.cancellable }));
      expect(planCancel(flipped, live('pending'))).toEqual({
        ok: false,
        code: 'ORDER_NOT_CANCELLABLE',
      });
      expect(planCancel(flipped, live('ready'))).toEqual({ ok: true });
      const deductEarly = DEFAULTS.map((s) => ({ ...s, deductsInventory: s.position === 2 }));
      expect(planAdvance(deductEarly, live('pending'))).toMatchObject({ deducts: true });
      expect(planAdvance(deductEarly, live('ready'))).toMatchObject({ deducts: false });
    });
  });

  it('holds over random shuffles and renames of the default flags', () => {
    for (let run = 0; run < 50; run++) {
      // Distinct, increasing positions with random gaps (positions are unique per tenant).
      let at = 0;
      const positions = DEFAULTS.map(() => (at += 1 + Math.floor(Math.random() * 7)));
      const stages = DEFAULTS.map((s, i) => ({
        ...s,
        key: `s-${run}-${Math.random().toString(36).slice(2, 8)}`,
        position: positions[i]!,
      })).sort(() => Math.random() - 0.5);
      const byPosition = [...stages].sort((a, b) => a.position - b.position);
      expect(firstStage(stages)).toBe(byPosition[0]);
      for (let i = 0; i < byPosition.length; i++) {
        const plan = planAdvance(stages, live(byPosition[i]!.key));
        const next = byPosition[i + 1];
        expect(plan).toEqual(
          next
            ? { ok: true, to: next, deducts: next.deductsInventory }
            : { ok: false, code: 'ORDER_AT_LAST_STAGE' },
        );
      }
    }
  });
});
