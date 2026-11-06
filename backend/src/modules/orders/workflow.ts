/**
 * Order workflow rules (ARCHITECTURE §6, ADR 0014). Pure: behavior comes from each stage's
 * `position`, `cancellable` and `deductsInventory` only. Keys are used solely to find the order's
 * current row; no code compares a key or a label to a literal (CLAUDE.md rule 2).
 */
export interface WorkflowStage {
  key: string;
  position: number;
  cancellable: boolean;
  deductsInventory: boolean;
}

export interface OrderState {
  stageKey: string;
  canceled: boolean;
}

export type AdvancePlan<S extends WorkflowStage> =
  | { ok: true; to: S; deducts: boolean }
  | { ok: false; code: 'ORDER_CANCELED' | 'ORDER_AT_LAST_STAGE' };

export type CancelPlan =
  { ok: true } | { ok: false; code: 'ORDER_CANCELED' | 'ORDER_NOT_CANCELLABLE' };

function byPosition<S extends WorkflowStage>(stages: readonly S[]): S[] {
  return [...stages].sort((a, b) => a.position - b.position);
}

function current<S extends WorkflowStage>(stages: readonly S[], order: OrderState): S {
  const stage = stages.find((s) => s.key === order.stageKey);
  // The composite FK makes this impossible in the database; a fixture mistake should be loud.
  if (!stage) throw new Error(`Order stage ${order.stageKey} is not in the workflow`);
  return stage;
}

/** Where a new order starts: the lowest position. */
export function firstStage<S extends WorkflowStage>(stages: readonly S[]): S {
  const first = byPosition(stages)[0];
  if (!first) throw new Error('This restaurant has no workflow stages');
  return first;
}

/** The next stage by position, and whether reaching it deducts inventory. */
export function planAdvance<S extends WorkflowStage>(
  stages: readonly S[],
  order: OrderState,
): AdvancePlan<S> {
  if (order.canceled) return { ok: false, code: 'ORDER_CANCELED' };
  const from = current(stages, order);
  const to = byPosition(stages).find((s) => s.position > from.position);
  if (!to) return { ok: false, code: 'ORDER_AT_LAST_STAGE' };
  return { ok: true, to, deducts: to.deductsInventory };
}

/** Cancel is allowed only while the current stage is flagged `cancellable`. */
export function planCancel(stages: readonly WorkflowStage[], order: OrderState): CancelPlan {
  if (order.canceled) return { ok: false, code: 'ORDER_CANCELED' };
  return current(stages, order).cancellable
    ? { ok: true }
    : { ok: false, code: 'ORDER_NOT_CANCELLABLE' };
}
