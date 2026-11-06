import { Prisma } from '../../generated/prisma/client';
import { buildTenantSeed, type TenantSeed } from './build-seed';
import { DEMO_TENANT, SECOND_TENANT } from './demo-data';
import { hashTrackingToken, seedId } from './seed-ids';

// B401 scenarios and the ledger invariants (ARCHITECTURE §5), checked on the built rows before
// anything touches a database. test/seed.e2e-spec.ts checks the same things in Postgres.

type Decimal = Prisma.Decimal;
// Row fields are typed as Prisma inputs (Decimal | DecimalJsLike | string | number); read them back as Decimal.
const D = (v: unknown): Decimal => new Prisma.Decimal(v as string);
const NOW = new Date('2026-11-06T18:00:00.000Z');
const seed: TenantSeed = buildTenantSeed(DEMO_TENANT, NOW);
const slug = DEMO_TENANT.slug;
const id = (table: string, key: string) => seedId(slug, table, key);
const ledger = [...seed.ledgerBeforeSnapshot, ...seed.ledgerAfterSnapshot];
const sum = (values: unknown[]): Decimal =>
  values.reduce<Decimal>((acc, v) => acc.plus(D(v)), D(0));
const stageByKey = new Map(seed.stages.map((s) => [s.key, s]));
const deductingKeys = seed.stages.filter((s) => s.deductsInventory).map((s) => s.key);

describe('buildTenantSeed: determinism', () => {
  it('builds the same rows for the same clock', () => {
    expect(buildTenantSeed(DEMO_TENANT, NOW)).toEqual(seed);
  });

  it('uses the same ids whatever the clock', () => {
    const later = buildTenantSeed(DEMO_TENANT, new Date('2027-01-01T00:00:00.000Z'));
    expect(later.orders.map((o) => o.id)).toEqual(seed.orders.map((o) => o.id));
    expect(later.ledgerBeforeSnapshot.map((t) => t.id)).toEqual(
      seed.ledgerBeforeSnapshot.map((t) => t.id),
    );
  });

  it('dates nothing in the future', () => {
    const dates = [
      ...seed.orders.flatMap((o) => [o.createdAt, o.updatedAt, o.canceledAt]),
      ...seed.history.map((h) => h.createdAt),
      ...ledger.map((t) => t.createdAt),
      ...seed.snapshots.map((s) => s.takenAt),
    ].filter((d): d is Date => d instanceof Date);
    expect(dates.length).toBeGreaterThan(0);
    expect(dates.filter((d) => d > NOW)).toEqual([]);
  });
});

describe('buildTenantSeed: demo tenant basics', () => {
  it('is the demo tenant with one branch and one demo user per role (ADR 0007)', () => {
    expect(seed.tenant).toMatchObject({ slug, isDemo: true, timezone: 'Africa/Cairo' });
    expect(seed.branches).toHaveLength(1);
    const demoUsers = seed.users.filter((u) => u.isDemo);
    expect(demoUsers.map((u) => u.role).sort()).toEqual(['ADMIN', 'MANAGER', 'WORKER']);
    for (const user of demoUsers.filter((u) => u.role !== 'ADMIN')) {
      expect(user.branchId).toBe(seed.branches[0]?.id);
    }
  });

  it('seeds the four default stages of ADR 0009', () => {
    expect(
      seed.stages.map((s) => [s.position, s.key, s.label, s.cancellable, s.deductsInventory]),
    ).toEqual([
      [1, 'pending', 'Pending', true, false],
      [2, 'in-preparation', 'In Preparation', false, false],
      [3, 'ready', 'Ready', false, false],
      [4, 'delivered', 'Delivered', false, true],
    ]);
  });

  it('has a full menu: several categories, active items with recipes, one archived item', () => {
    expect(seed.categories.length).toBeGreaterThanOrEqual(4);
    const active = seed.menuItems.filter((m) => m.status !== 'ARCHIVED');
    expect(active.length).toBeGreaterThanOrEqual(10);
    expect(seed.menuItems.filter((m) => m.status === 'ARCHIVED')).toHaveLength(1);
    for (const category of seed.categories) {
      expect(active.some((m) => m.categoryId === category.id)).toBe(true);
    }
    for (const item of active) {
      expect(seed.ingredients.some((i) => i.menuItemId === item.id)).toBe(true);
    }
    expect(seed.menuItems.every((m) => m.isCombo !== true)).toBe(true); // CHECK: no combos in Phase 1
  });
});

describe('buildTenantSeed: inventory', () => {
  const typeOf = new Map(seed.inventoryItems.map((i) => [i.id, i.type]));

  it('has every inventory item type', () => {
    expect([...new Set(seed.inventoryItems.map((i) => i.type))].sort()).toEqual([
      'MIXED',
      'RAW',
      'READY',
    ]);
  });

  it('keeps MIXED items out of branch_stock and the ledger (ADR 0002)', () => {
    const mixed = seed.inventoryItems.filter((i) => i.type === 'MIXED').map((i) => i.id);
    expect(seed.branchStock.filter((s) => mixed.includes(s.inventoryItemId))).toEqual([]);
    expect(ledger.filter((t) => mixed.includes(t.inventoryItemId))).toEqual([]);
    for (const m of mixed) {
      const components = seed.components.filter((c) => c.mixedItemId === m);
      expect(components.length).toBeGreaterThan(0);
      for (const c of components) expect(typeOf.get(c.componentItemId)).not.toBe('MIXED');
    }
  });

  it('gives every RAW and READY item a stock row backed by a PURCHASE', () => {
    const stocked = seed.inventoryItems.filter((i) => i.type !== 'MIXED').map((i) => i.id);
    expect(seed.branchStock.map((s) => s.inventoryItemId).sort()).toEqual([...stocked].sort());
    for (const item of stocked) {
      expect(ledger.some((t) => t.inventoryItemId === item && t.type === 'PURCHASE')).toBe(true);
    }
    expect(ledger.length).toBeGreaterThanOrEqual(stocked.length * 2);
  });

  it('has mozzarella, and only mozzarella, below its low-stock threshold', () => {
    const low = seed.branchStock.filter(
      (s) => s.lowStockThreshold != null && D(s.currentStock!).lessThan(D(s.lowStockThreshold)),
    );
    expect(low.map((s) => s.inventoryItemId)).toEqual([id('inventory_items', 'mozzarella')]);
    expect(seed.branchStock.filter((s) => D(s.currentStock!).isNegative())).toEqual([]);
  });

  it('keeps current_stock = latest snapshot + ledger since (ARCHITECTURE §5)', () => {
    for (const stock of seed.branchStock) {
      const rowsOf = (rows: typeof ledger) =>
        rows.filter((t) => t.inventoryItemId === stock.inventoryItemId).map((t) => t.quantityDelta);
      const snapshot = seed.snapshots.find((s) => s.inventoryItemId === stock.inventoryItemId);
      const expected = snapshot
        ? D(snapshot.quantity).plus(sum(rowsOf(seed.ledgerAfterSnapshot)))
        : sum(rowsOf(ledger));
      expect({ item: stock.inventoryItemId, stock: D(stock.currentStock!).toString() }).toEqual({
        item: stock.inventoryItemId,
        stock: expected.toString(),
      });
      if (snapshot) {
        expect(D(snapshot.quantity).toString()).toBe(
          sum(rowsOf(seed.ledgerBeforeSnapshot)).toString(),
        );
      }
    }
  });

  it('orders the ledger in time, with the snapshot between the two phases', () => {
    const times = (rows: typeof ledger) => rows.map((t) => (t.createdAt as Date).getTime());
    const before = times(seed.ledgerBeforeSnapshot);
    const after = times(seed.ledgerAfterSnapshot);
    expect(before).toEqual([...before].sort((a, b) => a - b));
    expect(after).toEqual([...after].sort((a, b) => a - b));
    const snapshotAt = Math.max(...seed.snapshots.map((s) => (s.takenAt as Date).getTime()));
    expect(Math.max(...before)).toBeLessThanOrEqual(snapshotAt);
    expect(Math.min(...after)).toBeGreaterThan(snapshotAt);
  });

  it('refuses a stock movement at the same minute as the count', () => {
    const broken = structuredClone(DEMO_TENANT);
    const count = broken.events.find((e) => e.kind === 'count')!;
    broken.orders[0]!.transitionsMinutesAgo[2] = count.minutesAgo;
    expect(() => buildTenantSeed(broken, NOW)).toThrow(/share the reconciliation count time/);
  });

  it('respects the ledger sign rules and stores a cost on every row (ADR 0005)', () => {
    for (const t of ledger) {
      const delta = D(t.quantityDelta);
      if (t.type === 'PURCHASE') expect(delta.isPositive()).toBe(true);
      if (t.type === 'CONSUMPTION' || t.type === 'WASTE') expect(delta.isNegative()).toBe(true);
      expect(delta.isZero()).toBe(false);
      expect(t.unitCost).not.toBeNull();
      expect(t.actorId).toBeDefined();
    }
  });

  it('keeps the moving average on branch_stock (ADR 0005)', () => {
    // Beef: 20 KG at 420.00, then yesterday's orders, then 10 KG at 440.00.
    const beef = seed.branchStock.find((s) => s.inventoryItemId === id('inventory_items', 'beef'));
    const purchases = ledger.filter(
      (t) => t.inventoryItemId === id('inventory_items', 'beef') && t.type === 'PURCHASE',
    );
    expect(purchases.map((p) => D(p.unitCost!).toFixed(2))).toEqual(['420.00', '440.00']);
    expect(D(beef!.avgUnitCost!).greaterThan(420)).toBe(true);
    expect(D(beef!.avgUnitCost!).lessThan(440)).toBe(true);
    expect(D(beef!.avgUnitCost!).decimalPlaces()).toBeLessThanOrEqual(4);
  });
});

describe('buildTenantSeed: orders', () => {
  const active = seed.orders.filter((o) => o.canceledAt == null);

  it('has at least one live order in every stage, plus a cancelled one', () => {
    for (const stage of seed.stages) {
      expect({ stage: stage.key, has: active.some((o) => o.stageKey === stage.key) }).toEqual({
        stage: stage.key,
        has: true,
      });
    }
    const cancelled = seed.orders.filter((o) => o.canceledAt != null);
    expect(cancelled.length).toBeGreaterThanOrEqual(1);
    for (const order of cancelled) {
      expect(stageByKey.get(order.stageKey)?.cancellable).toBe(true);
    }
  });

  it('places mostly guest orders, each with a tracking token hash (ADR 0008)', () => {
    const guests = seed.orders.filter((o) => o.placedByType === 'GUEST');
    expect(guests.length).toBeGreaterThan(seed.orders.length / 2);
    expect(seed.orders.some((o) => o.placedByType === 'STAFF')).toBe(true);
    for (const order of seed.orders) {
      if (order.placedByType === 'GUEST') {
        expect(order.placedById).toBeNull();
        const token = seed.trackingTokens.find((t) => t.orderId === order.id)?.token;
        expect(order.trackingTokenHash).toBe(hashTrackingToken(token!));
      } else {
        expect(order.placedById).toBeTruthy();
        expect(order.trackingTokenHash).toBeNull();
      }
    }
  });

  it('copies name and price into order items, and totals add up', () => {
    const menu = new Map(seed.menuItems.map((m) => [m.id, m]));
    for (const order of seed.orders) {
      const items = seed.orderItems.filter((i) => i.orderId === order.id);
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        const source = menu.get(item.menuItemId)!;
        expect(source.status).toBe('ACTIVE');
        expect(item.name).toBe(source.name);
        expect(D(item.unitPrice).toString()).toBe(D(source.price).toString());
        expect(D(item.lineTotal).toString()).toBe(
          D(item.unitPrice).times(item.quantity).toString(),
        );
      }
      expect(D(order.total).toString()).toBe(sum(items.map((i) => i.lineTotal)).toString());
    }
  });

  it('writes the stage history of every order', () => {
    for (const order of seed.orders) {
      const rows = seed.history.filter((h) => h.orderId === order.id);
      const position = stageByKey.get(order.stageKey)!.position;
      expect(rows[0]).toMatchObject({
        action: 'PLACED',
        fromStageKey: null,
        toStageKey: 'pending',
      });
      expect(rows.filter((h) => h.action === 'ADVANCED')).toHaveLength(position - 1);
      expect(rows.filter((h) => h.action === 'CANCELED')).toHaveLength(order.canceledAt ? 1 : 0);
      expect(rows.at(-1)?.createdAt).toEqual(order.updatedAt);
    }
  });

  it('deducts stock only for orders in a deducts_inventory stage, one row per item', () => {
    const consumption = ledger.filter((t) => t.type === 'CONSUMPTION');
    const deducted = new Set(consumption.map((t) => t.relatedOrderId));
    for (const order of seed.orders) {
      const shouldDeduct = deductingKeys.includes(order.stageKey) && order.canceledAt == null;
      expect({ order: order.id, deducted: deducted.has(order.id) }).toEqual({
        order: order.id,
        deducted: shouldDeduct,
      });
    }
    const keys = consumption.map((t) => `${t.relatedOrderId}/${t.inventoryItemId}`);
    expect(new Set(keys).size).toBe(keys.length); // idempotency key (ARCHITECTURE §5)
  });

  it('expands recipes and MIXED sauces into stock units (worked example: order o1)', () => {
    // o1: 2 x Classic Beef Burger, 2 x Fries, 2 x Cola.
    const rows = consumption('o1');
    expect(rows.get('beef')).toBe('-0.3'); // 150 G each
    expect(rows.get('burger-buns')).toBe('-2');
    expect(rows.get('cola-can')).toBe('-2');
    expect(rows.get('potatoes')).toBe('-0.5'); // 250 G each
    // 30 ML garlic sauce per burger: 0.03 L x 0.2 KG garlic per L, x 2 burgers.
    expect(rows.get('garlic')).toBe('-0.012');
    expect(rows.has('garlic-sauce')).toBe(false);
  });
});

describe('buildTenantSeed: waste and reconciliation', () => {
  it('logs a waste entry backed by its own WASTE row in the stock unit', () => {
    expect(seed.wasteEntries.length).toBeGreaterThanOrEqual(1);
    for (const waste of seed.wasteEntries) {
      const tx = ledger.find((t) => t.id === waste.transactionId)!;
      expect(tx).toMatchObject({
        type: 'WASTE',
        branchId: waste.branchId,
        inventoryItemId: waste.inventoryItemId,
        actorId: waste.actorId,
      });
      expect(D(tx.quantityDelta).isNegative()).toBe(true);
    }
    const tomatoes = seed.wasteEntries.find(
      (w) => w.inventoryItemId === id('inventory_items', 'tomatoes'),
    )!;
    expect([D(tomatoes.quantity).toString(), tomatoes.unit]).toEqual(['600', 'G']);
    expect(D(ledger.find((t) => t.id === tomatoes.transactionId)!.quantityDelta).toString()).toBe(
      '-0.6',
    );
  });

  it('reconciles with a gap (ADJUSTMENT row) and without one, each with its snapshot', () => {
    expect(seed.reconciliations.some((r) => !D(r.gap).isZero())).toBe(true);
    expect(seed.reconciliations.some((r) => D(r.gap).isZero())).toBe(true);
    for (const entry of seed.reconciliations) {
      expect(D(entry.gap).toString()).toBe(
        D(entry.countedQuantity).minus(D(entry.expectedQuantity)).toString(),
      );
      const snapshot = seed.snapshots.find((s) => s.id === entry.snapshotId)!;
      expect(snapshot.inventoryItemId).toBe(entry.inventoryItemId);
      expect(D(snapshot.quantity).toString()).toBe(D(entry.countedQuantity).toString());
      if (D(entry.gap).isZero()) {
        expect(entry.adjustmentTransactionId).toBeNull();
      } else {
        const adjustment = ledger.find((t) => t.id === entry.adjustmentTransactionId)!;
        expect(adjustment.type).toBe('ADJUSTMENT');
        expect(D(adjustment.quantityDelta).toString()).toBe(D(entry.gap).toString());
      }
    }
  });

  it('never counts logged waste as part of the gap (ARCHITECTURE §5)', () => {
    const tomatoes = id('inventory_items', 'tomatoes');
    const entry = seed.reconciliations.find((r) => r.inventoryItemId === tomatoes)!;
    const beforeCount = seed.ledgerBeforeSnapshot.filter(
      (t) => t.inventoryItemId === tomatoes && t.type !== 'ADJUSTMENT',
    );
    expect(beforeCount.some((t) => t.type === 'WASTE')).toBe(true);
    expect(D(entry.expectedQuantity).toString()).toBe(
      sum(beforeCount.map((t) => t.quantityDelta)).toString(),
    );
  });
});

describe('buildTenantSeed: precision (ADR 0013)', () => {
  const scaleOk = (value: unknown, scale: number) =>
    value == null || D(value).decimalPlaces() <= scale;

  it('fits every decimal into its column', () => {
    const checks: [unknown, number][] = [
      ...seed.menuItems.map((m) => [m.price, 2] as [unknown, number]),
      ...seed.orders.map((o) => [o.total, 2] as [unknown, number]),
      ...seed.orderItems.flatMap((i) => [
        [i.unitPrice, 2] as [unknown, number],
        [i.lineTotal, 2] as [unknown, number],
      ]),
      ...ledger.flatMap((t) => [
        [t.quantityDelta, 3] as [unknown, number],
        [t.unitCost, 4] as [unknown, number],
      ]),
      ...seed.branchStock.flatMap((s) => [
        [s.currentStock, 3] as [unknown, number],
        [s.lowStockThreshold, 3] as [unknown, number],
        [s.avgUnitCost, 4] as [unknown, number],
      ]),
      ...seed.ingredients.map((i) => [i.quantity, 3] as [unknown, number]),
      ...seed.components.map((c) => [c.quantity, 3] as [unknown, number]),
    ];
    expect(checks.filter(([value, scale]) => !scaleOk(value, scale))).toEqual([]);
  });

  it('refuses a recipe whose converted quantity needs more than 3 decimals', () => {
    const broken = structuredClone(DEMO_TENANT);
    const garlic = broken.inventory.find((i) => i.key === 'garlic-sauce')!;
    garlic.components![0]!.quantity = '0.2003';
    expect(() => buildTenantSeed(broken, NOW)).toThrow(/more than 3 decimals/);
  });
});

describe('buildTenantSeed: second tenant (for B503 isolation tests)', () => {
  const second = buildTenantSeed(SECOND_TENANT, NOW);

  it('is a separate, non-demo tenant with a branch, the stages and demo users only', () => {
    expect(second.tenant.isDemo).toBe(false);
    expect(second.tenant.slug).not.toBe(slug);
    expect(second.branches).toHaveLength(1);
    expect(second.stages).toHaveLength(4);
    expect(second.users.map((u) => u.role).sort()).toEqual(['ADMIN', 'MANAGER', 'WORKER']);
    expect([
      second.orders,
      second.inventoryItems,
      second.menuItems,
      second.ledgerBeforeSnapshot,
    ]).toEqual([[], [], [], []]);
  });

  it('shares no id with the demo tenant', () => {
    const ids = (s: TenantSeed) =>
      [s.tenant, ...s.branches, ...s.users, ...s.stages].map((r) => r.id);
    const demoIds = new Set(ids(seed));
    expect(ids(second).filter((i) => demoIds.has(i))).toEqual([]);
  });
});

/** CONSUMPTION deltas of one demo order, keyed by inventory item key. */
function consumption(orderKey: string): Map<string, string> {
  const orderId = id('orders', orderKey);
  const keyOf = new Map(DEMO_TENANT.inventory.map((i) => [id('inventory_items', i.key), i.key]));
  return new Map(
    ledger
      .filter((t) => t.type === 'CONSUMPTION' && t.relatedOrderId === orderId)
      .map((t) => [keyOf.get(t.inventoryItemId)!, D(t.quantityDelta).toString()]),
  );
}
