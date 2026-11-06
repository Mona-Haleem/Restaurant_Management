import { Prisma } from '../../generated/prisma/client';
import type { InventoryTransactionType } from '../../generated/prisma/enums';
import {
  DEFAULT_STAGES,
  SETUP_MINUTES_AGO,
  type InventorySeed,
  type MenuSeed,
  type OrderSeed,
  type TenantSeedDefinition,
} from './demo-data';
import {
  expandOrder,
  nextAverageCost,
  type ComponentLine,
  type RecipeLine,
  type StockItem,
} from '../../modules/inventory/ledger-math';
import { assertScale, toStockUnit } from './quantities';
import { demoTrackingToken, hashTrackingToken, seedId } from './seed-ids';

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

const STOCK_SCALE = 3;
const MONEY_SCALE = 2;
const COST_SCALE = 4;

type LedgerRow = Prisma.InventoryTransactionCreateManyInput;
/** `through_seq` is only known once the ledger rows before it are in the database. */
export type SnapshotRow = Omit<Prisma.InventorySnapshotCreateManyInput, 'throughSeq'>;

/** Every row of one tenant, in an order the writer can insert as-is. */
export interface TenantSeed {
  tenant: Prisma.TenantCreateManyInput & { id: string; slug: string };
  branches: (Prisma.BranchCreateManyInput & { id: string })[];
  users: (Prisma.UserCreateManyInput & { id: string })[];
  stages: (Prisma.OrderWorkflowStageCreateManyInput & { id: string })[];
  categories: (Prisma.CategoryCreateManyInput & { id: string })[];
  inventoryItems: (Prisma.InventoryItemCreateManyInput & { id: string })[];
  components: Prisma.InventoryItemComponentCreateManyInput[];
  menuItems: (Prisma.MenuItemCreateManyInput & { id: string })[];
  ingredients: Prisma.MenuItemIngredientCreateManyInput[];
  orders: (Prisma.OrderCreateManyInput & { id: string })[];
  orderItems: Prisma.OrderItemCreateManyInput[];
  history: Prisma.OrderStageHistoryCreateManyInput[];
  /** Ledger rows up to and including the reconciliation count, in time order. */
  ledgerBeforeSnapshot: (LedgerRow & { id: string })[];
  wasteEntries: Prisma.WasteEntryCreateManyInput[];
  snapshots: (SnapshotRow & { id: string })[];
  reconciliations: Prisma.ReconciliationEntryCreateManyInput[];
  /** Ledger rows after the snapshot, in time order. */
  ledgerAfterSnapshot: (LedgerRow & { id: string })[];
  branchStock: Prisma.BranchStockCreateManyInput[];
  /** Plain tracking tokens of the guest orders (demo only; the database stores the hash). */
  trackingTokens: { orderId: string; orderKey: string; token: string }[];
}

interface ItemState {
  stock: Decimal;
  avg: Decimal | null;
  lastAt: Date | null;
}

/**
 * Turns a tenant definition into rows. Pure: ids come from seedId and times from `now`, so the
 * same input always gives the same rows. Stock is computed by walking the ledger in time order
 * with the ADR 0005 cost rules, so `current_stock = snapshot + ledger since` holds by construction
 * (ADR 0016: the seed is the only writer besides the ledger service).
 */
export function buildTenantSeed(def: TenantSeedDefinition, now: Date): TenantSeed {
  const slug = def.slug;
  const id = (table: string, key: string): string => seedId(slug, table, key);
  const at = (minutesAgo: number): Date => new Date(now.getTime() - minutesAgo * 60_000);
  const setupAt = at(SETUP_MINUTES_AGO);
  const stamps = (date: Date): { createdAt: Date; updatedAt: Date } => ({
    createdAt: date,
    updatedAt: date,
  });

  const tenantId = id('tenants', slug);
  const branchId = id('branches', def.branch.key);
  const scope = { tenantId };
  const userId = (role: string): string => {
    const user = def.users.find((u) => u.role === role);
    if (!user) throw new Error(`${slug} has no ${role} user`);
    return id('users', user.key);
  };
  const managerId = def.users.length ? userId('MANAGER') : '';
  const workerId = def.users.length ? userId('WORKER') : '';

  const items = new Map(def.inventory.map((i) => [i.key, i]));
  const menu = new Map(def.menu.map((m) => [m.key, m]));
  const itemOf = (key: string): InventorySeed => {
    const item = items.get(key);
    if (!item) throw new Error(`unknown inventory item "${key}"`);
    return item;
  };
  const menuOf = (key: string): MenuSeed => {
    const item = menu.get(key);
    if (!item) throw new Error(`unknown menu item "${key}"`);
    return item;
  };
  const dec = (value: string, scale: number, label: string): Decimal =>
    assertScale(new Decimal(value), scale, label);

  const seed: TenantSeed = {
    tenant: {
      id: tenantId,
      slug,
      name: def.name,
      timezone: def.timezone,
      isDemo: def.isDemo,
      ...stamps(setupAt),
    },
    branches: [{ id: branchId, ...scope, name: def.branch.name, ...stamps(setupAt) }],
    users: def.users.map((u) => ({
      id: id('users', u.key),
      ...scope,
      branchId: u.role === 'ADMIN' ? null : branchId,
      name: u.name,
      email: u.email,
      passwordHash: null,
      role: u.role,
      isDemo: true,
      ...stamps(setupAt),
    })),
    stages: DEFAULT_STAGES.map((s, index) => ({
      id: id('order_workflow_stages', s.key),
      ...scope,
      key: s.key,
      label: s.label,
      position: index + 1,
      cancellable: s.cancellable,
      deductsInventory: s.deductsInventory,
      ...stamps(setupAt),
    })),
    categories: def.categories.map((c, index) => ({
      id: id('categories', c.key),
      ...scope,
      name: c.name,
      position: index + 1,
      ...stamps(setupAt),
    })),
    inventoryItems: def.inventory.map((i) => ({
      id: id('inventory_items', i.key),
      ...scope,
      name: i.name,
      type: i.type,
      unit: i.unit,
      standardUnitCost: i.standardUnitCost
        ? dec(i.standardUnitCost, COST_SCALE, `${i.key}.standardUnitCost`)
        : null,
      ...stamps(setupAt),
    })),
    components: def.inventory.flatMap((i) =>
      (i.components ?? []).map((c) => ({
        id: id('inventory_item_components', `${i.key}:${c.item}`),
        ...scope,
        mixedItemId: id('inventory_items', i.key),
        componentItemId: id('inventory_items', itemOf(c.item).key),
        quantity: dec(c.quantity, STOCK_SCALE, `${i.key}.${c.item}`),
        unit: c.unit,
        ...stamps(setupAt),
      })),
    ),
    menuItems: def.menu.map((m) => ({
      id: id('menu_items', m.key),
      ...scope,
      categoryId: id('categories', m.category),
      branchId: null,
      name: m.name,
      description: m.description,
      price: dec(m.price, MONEY_SCALE, `${m.key}.price`),
      status: m.status ?? 'ACTIVE',
      isCombo: false,
      ...stamps(setupAt),
    })),
    ingredients: def.menu.flatMap((m) =>
      m.recipe.map((r) => ({
        id: id('menu_item_ingredients', `${m.key}:${r.item}`),
        ...scope,
        menuItemId: id('menu_items', m.key),
        inventoryItemId: id('inventory_items', itemOf(r.item).key),
        quantity: dec(r.quantity, STOCK_SCALE, `${m.key}.${r.item}`),
        unit: r.unit,
        ...stamps(setupAt),
      })),
    ),
    orders: [],
    orderItems: [],
    history: [],
    ledgerBeforeSnapshot: [],
    wasteEntries: [],
    snapshots: [],
    reconciliations: [],
    ledgerAfterSnapshot: [],
    branchStock: [],
    trackingTokens: [],
  };

  // The same recipe expansion as the ledger service (ADR 0016: no second copy), keyed by seed key.
  const stockItems = new Map<string, StockItem>(
    def.inventory.map((i) => [i.key, { id: i.key, type: i.type, unit: i.unit }]),
  );
  const recipes = new Map<string, RecipeLine[]>(
    def.menu.map((m) => [
      m.key,
      m.recipe.map((r) => ({
        inventoryItemId: itemOf(r.item).key,
        quantity: new Decimal(r.quantity),
        unit: r.unit,
      })),
    ]),
  );
  const mixedComponents = new Map<string, ComponentLine[]>(
    def.inventory.map((i) => [
      i.key,
      (i.components ?? []).map((c) => ({
        componentItemId: itemOf(c.item).key,
        quantity: new Decimal(c.quantity),
        unit: c.unit,
      })),
    ]),
  );

  // ── Orders, and the stock movements they cause ──────────────────────────────────────────────
  type Movement =
    | { at: Date; kind: 'event'; index: number }
    | { at: Date; kind: 'consumption'; order: OrderSeed; actorId: string };
  const movements: Movement[] = def.events.map((e, index) => ({
    at: at(e.minutesAgo),
    kind: 'event',
    index,
  }));

  for (const o of def.orders) {
    const orderId = id('orders', o.key);
    const stage = seed.stages[o.transitionsMinutesAgo.length];
    if (!stage) throw new Error(`${o.key} moves past the last stage`);
    if (o.canceledMinutesAgo !== undefined && !stage.cancellable) {
      throw new Error(`${o.key} is cancelled in a stage that is not cancellable`);
    }
    const placedAt = at(o.placedMinutesAgo);
    const staff = o.placedBy === 'STAFF';
    const lines = o.items.map(([menuKey, quantity], index) => {
      const source = menuOf(menuKey);
      const unitPrice = new Decimal(source.price);
      return {
        id: id('order_items', `${o.key}:${index}`),
        ...scope,
        orderId,
        menuItemId: id('menu_items', menuKey),
        name: source.name,
        unitPrice,
        quantity,
        lineTotal: unitPrice.times(quantity),
        ...stamps(placedAt),
      };
    });

    const history: Prisma.OrderStageHistoryCreateManyInput[] = [
      {
        id: id('order_stage_history', `${o.key}:0`),
        ...scope,
        orderId,
        action: 'PLACED',
        fromStageKey: null,
        toStageKey: seed.stages[0]!.key,
        actorId: staff ? workerId : null,
        ...stamps(placedAt),
      },
    ];
    o.transitionsMinutesAgo.forEach((minutesAgo, index) => {
      const from = seed.stages[index]!;
      const to = seed.stages[index + 1]!;
      const movedAt = at(minutesAgo);
      history.push({
        id: id('order_stage_history', `${o.key}:${index + 1}`),
        ...scope,
        orderId,
        action: 'ADVANCED',
        fromStageKey: from.key,
        toStageKey: to.key,
        actorId: workerId,
        ...stamps(movedAt),
      });
      // Behaviour from flags only (ARCHITECTURE §6): reaching a deducting stage consumes stock.
      if (to.deductsInventory) {
        movements.push({ at: movedAt, kind: 'consumption', order: o, actorId: workerId });
      }
    });
    if (o.canceledMinutesAgo !== undefined) {
      history.push({
        id: id('order_stage_history', `${o.key}:cancel`),
        ...scope,
        orderId,
        action: 'CANCELED',
        fromStageKey: stage.key,
        toStageKey: null,
        actorId: null, // cancelled by the guest through the tracking token
        ...stamps(at(o.canceledMinutesAgo)),
      });
    }

    const token = staff ? null : demoTrackingToken(slug, o.key);
    if (token) seed.trackingTokens.push({ orderId, orderKey: o.key, token });
    const lastAt = history.at(-1)!.createdAt as Date;
    seed.orders.push({
      id: orderId,
      ...scope,
      branchId,
      stageKey: stage.key,
      canceledAt: o.canceledMinutesAgo === undefined ? null : at(o.canceledMinutesAgo),
      placedByType: o.placedBy,
      placedById: staff ? workerId : null,
      total: lines.reduce((sum, l) => sum.plus(l.lineTotal), new Decimal(0)),
      trackingTokenHash: token ? hashTrackingToken(token) : null,
      note: o.note ?? null,
      createdAt: placedAt,
      updatedAt: lastAt,
    });
    seed.orderItems.push(...lines);
    seed.history.push(...history);
  }

  // ── Walk the ledger in time order ───────────────────────────────────────────────────────────
  const counts = def.events.filter((e) => e.kind === 'count');
  const countTimes = new Set(counts.map((e) => e.minutesAgo));
  if (countTimes.size > 1) throw new Error('all reconciliation counts must share one time');
  const snapshotAt = counts.length ? at(counts[0]!.minutesAgo) : null;

  const state = new Map<string, ItemState>();
  const stateOf = (key: string): ItemState => {
    const item = itemOf(key);
    if (item.type === 'MIXED') throw new Error(`MIXED item ${key} cannot be in the ledger`);
    let s = state.get(key);
    if (!s) {
      s = { stock: new Decimal(0), avg: null, lastAt: null };
      state.set(key, s);
    }
    return s;
  };
  const costOf = (key: string, s: ItemState): Decimal | null => {
    const standard = itemOf(key).standardUnitCost;
    return s.avg ?? (standard ? new Decimal(standard) : null);
  };
  const write = (
    txId: string,
    key: string,
    type: InventoryTransactionType,
    delta: Decimal,
    when: Date,
    extra: { unitCost: Decimal | null; actorId: string; relatedOrderId?: string; note?: string },
  ): void => {
    const s = stateOf(key);
    assertScale(delta, STOCK_SCALE, `${type} ${key}`);
    s.stock = s.stock.plus(delta);
    s.lastAt = when;
    const row = {
      id: txId,
      ...scope,
      branchId,
      inventoryItemId: id('inventory_items', key),
      type,
      quantityDelta: delta,
      unitCost: extra.unitCost,
      relatedOrderId: extra.relatedOrderId ?? null,
      actorId: extra.actorId,
      note: extra.note ?? null,
      ...stamps(when),
    };
    (snapshotAt && when > snapshotAt ? seed.ledgerAfterSnapshot : seed.ledgerBeforeSnapshot).push(
      row,
    );
  };

  // Stable sort: same-time movements keep the order they were declared in.
  movements.sort((a, b) => a.at.getTime() - b.at.getTime());
  // Rows are split around the snapshot by time, so nothing else may share the count's minute.
  const atSnapshot = movements.filter((m) => snapshotAt && m.at.getTime() === snapshotAt.getTime());
  if (atSnapshot.some((m) => m.kind !== 'event' || def.events[m.index]?.kind !== 'count')) {
    throw new Error('no other stock movement may share the reconciliation count time');
  }
  for (const m of movements) {
    if (m.kind === 'consumption') {
      // One CONSUMPTION row per item per order, aggregated by the ledger's own function.
      const total = expandOrder(
        m.order.items.map(([menuItemId, quantity]) => ({ menuItemId, quantity })),
        recipes,
        stockItems,
        mixedComponents,
      );
      for (const [key, qty] of total) {
        write(
          id('inventory_transactions', `consumption:${m.order.key}:${key}`),
          key,
          'CONSUMPTION',
          qty.negated(),
          m.at,
          {
            unitCost: costOf(key, stateOf(key)),
            actorId: m.actorId,
            relatedOrderId: id('orders', m.order.key),
          },
        );
      }
      continue;
    }

    const e = def.events[m.index]!;
    if (e.kind === 'purchase') {
      const s = stateOf(e.item);
      const qty = dec(e.quantity, STOCK_SCALE, `purchase ${e.key}`);
      const cost = dec(e.unitCost, COST_SCALE, `purchase ${e.key} cost`);
      // ADR 0005 moving average, computed by the ledger's own function.
      s.avg = nextAverageCost(s.stock, s.avg, qty, cost);
      write(id('inventory_transactions', `purchase:${e.key}`), e.item, 'PURCHASE', qty, m.at, {
        unitCost: cost,
        actorId: managerId,
        note: e.note,
      });
    } else if (e.kind === 'waste') {
      const item = itemOf(e.item);
      const entered = dec(e.quantity, STOCK_SCALE, `waste ${e.key}`);
      const qty = toStockUnit(entered, e.unit, item.unit);
      const txId = id('inventory_transactions', `waste:${e.key}`);
      write(txId, e.item, 'WASTE', qty.negated(), m.at, {
        unitCost: costOf(e.item, stateOf(e.item)),
        actorId: workerId,
        note: e.reason,
      });
      seed.wasteEntries.push({
        id: id('waste_entries', e.key),
        ...scope,
        branchId,
        inventoryItemId: id('inventory_items', e.item),
        quantity: entered,
        unit: e.unit,
        reason: e.reason,
        transactionId: txId,
        actorId: workerId,
        ...stamps(m.at),
      });
    } else {
      // Reconciliation (ARCHITECTURE §5): entry + ADJUSTMENT for the gap + snapshot, together.
      const s = stateOf(e.item);
      const expected = s.stock;
      const gap = dec(e.gap, STOCK_SCALE, `count ${e.key} gap`);
      const counted = expected.plus(gap);
      if (counted.isNegative()) throw new Error(`count ${e.key} would be negative`);
      let adjustmentId: string | null = null;
      if (!gap.isZero()) {
        adjustmentId = id('inventory_transactions', `adjustment:${e.key}`);
        write(adjustmentId, e.item, 'ADJUSTMENT', gap, m.at, {
          unitCost: costOf(e.item, s),
          actorId: managerId,
          note: e.note,
        });
      }
      const snapshotId = id('inventory_snapshots', e.key);
      seed.snapshots.push({
        id: snapshotId,
        ...scope,
        branchId,
        inventoryItemId: id('inventory_items', e.item),
        quantity: counted,
        takenAt: m.at,
        ...stamps(m.at),
      });
      seed.reconciliations.push({
        id: id('reconciliation_entries', e.key),
        ...scope,
        branchId,
        inventoryItemId: id('inventory_items', e.item),
        countedQuantity: counted,
        expectedQuantity: expected,
        gap,
        adjustmentTransactionId: adjustmentId,
        snapshotId,
        actorId: managerId,
        note: e.note,
        ...stamps(m.at),
      });
    }
  }

  // ── Cached stock per (branch, item): RAW and READY only (ADR 0002) ──────────────────────────
  for (const item of def.inventory.filter((i) => i.type !== 'MIXED')) {
    const s = state.get(item.key) ?? { stock: new Decimal(0), avg: null, lastAt: null };
    seed.branchStock.push({
      id: id('branch_stock', `${def.branch.key}:${item.key}`),
      ...scope,
      branchId,
      inventoryItemId: id('inventory_items', item.key),
      currentStock: s.stock,
      lowStockThreshold: item.lowStockThreshold
        ? dec(item.lowStockThreshold, STOCK_SCALE, `${item.key}.lowStockThreshold`)
        : null,
      avgUnitCost: s.avg,
      ...stamps(s.lastAt ?? setupAt),
    });
  }

  return seed;
}
