import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type { PlacedByType } from '../../generated/prisma/enums';
import { formatDecimal, MONEY, parseDecimal } from '../../common/decimal/decimal';
import { AppException } from '../../common/errors/app-exception';
import { RequestContextStore } from '../../context/request-context.store';
import { TENANT_DB, type TenantDb } from '../../prisma/tenant-prisma';
import { LedgerService, type LedgerTx } from '../inventory/ledger.service';
import type { OrderDto, PlaceOrderDto, PlacedOrderDto, WorkflowDto } from './dto/order.dto';
import { priceOrder } from './pricing';
import { hashTrackingToken, newTrackingToken } from './tracking-token';
import { firstStage, planAdvance, planCancel, type WorkflowStage } from './workflow';

const STAGE_FIELDS = {
  key: true,
  label: true,
  position: true,
  cancellable: true,
  deductsInventory: true,
} as const;
const ORDER_FIELDS = {
  id: true,
  branchId: true,
  stageKey: true,
  canceledAt: true,
  placedByType: true,
  placedById: true,
  total: true,
  note: true,
  createdAt: true,
  updatedAt: true,
} as const;
const ITEM_FIELDS = {
  id: true,
  menuItemId: true,
  name: true,
  unitPrice: true,
  quantity: true,
  lineTotal: true,
} as const;

type OrderRow = Prisma.OrderGetPayload<{ select: typeof ORDER_FIELDS }>;
type ItemRow = Prisma.OrderItemGetPayload<{ select: typeof ITEM_FIELDS }>;
/** `orders.total` is numeric(12,2): at most 10 digits before the point. */
const MAX_TOTAL = parseDecimal('9999999999.99');

/** Who acts on an order: a staff user, or a guest holding the tracking token (actor NULL). */
interface Actor {
  id: string | null;
}

/**
 * Order lifecycle on the tenant's configurable workflow (B801, ARCHITECTURE §6). Every decision
 * comes from `workflow.ts` (flags and positions only). A stage change is a compare-and-set on
 * the stage the caller read, so two concurrent changes of one order can never both apply; the
 * loser gets 409 ORDER_STAGE_CHANGED.
 */
@Injectable()
export class OrdersService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantDb,
    private readonly context: RequestContextStore,
    private readonly ledger: LedgerService,
  ) {}

  private get tenantId(): string {
    return this.context.require().tenantId;
  }

  // ── Workflow ────────────────────────────────────────────────────────────────────────────
  async getWorkflow(): Promise<WorkflowDto> {
    const stages = await this.db.orderWorkflowStage.findMany({
      orderBy: { position: 'asc' },
      select: STAGE_FIELDS,
    });
    return { stages };
  }

  // ── Placing ─────────────────────────────────────────────────────────────────────────────
  /**
   * A guest order is GUEST with a tracking token (returned once, stored hashed, ADR 0008); a
   * staff caller's order is STAFF with their id. Lines copy the menu's name and price now.
   */
  async placeOrder(dto: PlaceOrderDto): Promise<PlacedOrderDto> {
    const { branchId, actor } = this.context.require();
    if (!branchId) {
      throw new AppException(
        400,
        'BRANCH_REQUIRED',
        'Choose a branch first: this restaurant has more than one.',
      );
    }
    const tenantId = this.tenantId;
    const ids = [...new Set(dto.items.map((l) => l.menuItemId))];

    return this.db.$transaction(async (tx) => {
      const menu = await tx.menuItem.findMany({
        where: {
          id: { in: ids },
          status: 'ACTIVE',
          category: { isActive: true },
          OR: [{ branchId: null }, { branchId }],
        },
        select: { id: true, name: true, price: true },
      });
      const found = new Map(menu.map((m) => [m.id, m]));
      const missing = ids.filter((id) => !found.has(id));
      if (missing.length > 0) {
        throw new AppException(
          400,
          'MENU_ITEM_UNAVAILABLE',
          'Some items are not on the menu of this branch.',
          { menuItemIds: missing },
        );
      }
      const priced = priceOrder(dto.items, found);
      if (priced.total.greaterThan(MAX_TOTAL)) {
        throw new AppException(400, 'ORDER_TOTAL_TOO_LARGE', 'The order total is too large.');
      }

      const start = firstStage(await this.loadStages(tx));
      const placedByType: PlacedByType = actor ? 'STAFF' : 'GUEST';
      const token = actor ? null : newTrackingToken();
      const orderId = randomUUID();
      await tx.order.create({
        data: {
          id: orderId,
          tenantId,
          branchId,
          stageKey: start.key,
          placedByType,
          placedById: actor?.id ?? null,
          total: priced.total,
          trackingTokenHash: token?.hash ?? null,
          note: dto.note ? dto.note : null,
        },
      });
      await tx.orderItem.createMany({
        data: priced.lines.map((l) => ({
          tenantId,
          orderId,
          menuItemId: l.menuItemId,
          name: l.name,
          unitPrice: l.unitPrice,
          quantity: l.quantity,
          lineTotal: l.lineTotal,
        })),
      });
      await tx.orderStageHistory.create({
        data: {
          tenantId,
          orderId,
          action: 'PLACED',
          fromStageKey: null,
          toStageKey: start.key,
          actorId: actor?.id ?? null,
        },
      });
      return { ...(await this.read(tx, orderId)), trackingToken: token?.token ?? null };
    });
  }

  // ── Advancing ───────────────────────────────────────────────────────────────────────────
  /**
   * Moves the order to the next stage by position. Reaching a `deducts_inventory` stage calls
   * the ledger in this same transaction; the ledger is idempotent, so a later deducting stage
   * (or a retry) never deducts twice.
   */
  async advanceOrder(orderId: string): Promise<OrderDto> {
    const actor = this.staff();
    return this.db.$transaction(async (tx) => {
      const order = await this.findForStaff(tx, orderId);
      const plan = planAdvance(await this.loadStages(tx), this.state(order));
      if (!plan.ok) throw this.refused(plan.code, order);

      await this.moveStage(tx, order, { stageKey: plan.to.key });
      if (plan.deducts) {
        await this.ledger.deductOrder(tx, { orderId: order.id, actorId: actor.id });
      }
      await tx.orderStageHistory.create({
        data: {
          tenantId: this.tenantId,
          orderId: order.id,
          action: 'ADVANCED',
          fromStageKey: order.stageKey,
          toStageKey: plan.to.key,
          actorId: actor.id,
        },
      });
      return this.read(tx, order.id);
    });
  }

  // ── Cancelling ──────────────────────────────────────────────────────────────────────────
  /** Staff cancel: only while the current stage is `cancellable`. No inventory change. */
  cancelOrder(orderId: string): Promise<OrderDto> {
    const actor = this.staff();
    return this.db.$transaction(async (tx) =>
      this.cancel(tx, await this.findForStaff(tx, orderId), actor),
    );
  }

  /** Guest cancel with the tracking token (ADR 0008). An unknown token is a plain 404. */
  cancelTrackedOrder(token: string): Promise<OrderDto> {
    return this.db.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { trackingTokenHash: hashTrackingToken(token) },
        select: ORDER_FIELDS,
      });
      if (!order) throw new AppException(404, 'ORDER_NOT_FOUND', 'No such order.');
      // NULL for a guest; a staff caller using the token is still recorded as themselves.
      return this.cancel(tx, order, { id: this.context.require().actor?.id ?? null });
    });
  }

  // ── Internals ───────────────────────────────────────────────────────────────────────────
  private async cancel(tx: LedgerTx, order: OrderRow, actor: Actor): Promise<OrderDto> {
    const plan = planCancel(await this.loadStages(tx), this.state(order));
    if (!plan.ok) throw this.refused(plan.code, order);
    await this.moveStage(tx, order, { canceledAt: new Date() });
    await tx.orderStageHistory.create({
      data: {
        tenantId: this.tenantId,
        orderId: order.id,
        action: 'CANCELED',
        fromStageKey: order.stageKey,
        toStageKey: null,
        actorId: actor.id,
      },
    });
    return this.read(tx, order.id);
  }

  /**
   * Compare-and-set on the stage the caller read. The UPDATE waits for a concurrent change of
   * the same order and then re-checks its condition, so only one of them applies.
   */
  private async moveStage(
    tx: LedgerTx,
    order: OrderRow,
    data: { stageKey: string } | { canceledAt: Date },
  ): Promise<void> {
    const moved = await tx.order.updateMany({
      where: { id: order.id, stageKey: order.stageKey, canceledAt: null },
      data,
    });
    if (moved.count === 0) {
      throw new AppException(
        409,
        'ORDER_STAGE_CHANGED',
        'The order changed meanwhile. Reload it and try again.',
        { orderId: order.id },
      );
    }
  }

  /** Staff only. Non-ADMIN staff act within their own branch; others' orders do not exist. */
  private async findForStaff(tx: LedgerTx, orderId: string): Promise<OrderRow> {
    const { actor, branchId } = this.context.require();
    const anyBranch = actor?.role === 'ADMIN';
    const order =
      anyBranch || branchId
        ? await tx.order.findFirst({
            where: { id: orderId, ...(anyBranch || !branchId ? {} : { branchId }) },
            select: ORDER_FIELDS,
          })
        : null;
    if (!order) throw new AppException(404, 'ORDER_NOT_FOUND', 'No such order.', { orderId });
    return order;
  }

  private staff(): { id: string } {
    const actor = this.context.require().actor;
    // The route guard already requires a role; this keeps the type honest.
    if (!actor) throw new AppException(401, 'AUTH_REQUIRED', 'This action needs a staff role.');
    return actor;
  }

  private loadStages(tx: LedgerTx): Promise<WorkflowStage[]> {
    return tx.orderWorkflowStage.findMany({
      select: { key: true, position: true, cancellable: true, deductsInventory: true },
    });
  }

  private state(order: OrderRow): { stageKey: string; canceled: boolean } {
    return { stageKey: order.stageKey, canceled: order.canceledAt !== null };
  }

  private refused(
    code: 'ORDER_CANCELED' | 'ORDER_AT_LAST_STAGE' | 'ORDER_NOT_CANCELLABLE',
    order: OrderRow,
  ): AppException {
    const messages = {
      ORDER_CANCELED: 'The order is cancelled.',
      ORDER_AT_LAST_STAGE: 'The order is already at the last stage.',
      ORDER_NOT_CANCELLABLE: 'The order can no longer be cancelled at this stage.',
    } as const;
    return new AppException(409, code, messages[code], {
      orderId: order.id,
      stageKey: order.stageKey,
    });
  }

  private async read(tx: LedgerTx, orderId: string): Promise<OrderDto> {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: ORDER_FIELDS,
    });
    const items = await tx.orderItem.findMany({
      where: { orderId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: ITEM_FIELDS,
    });
    return toOrderDto(order, items);
  }
}

function toOrderDto(order: OrderRow, items: ItemRow[]): OrderDto {
  return {
    id: order.id,
    branchId: order.branchId,
    stageKey: order.stageKey,
    status: order.canceledAt ? 'cancelled' : order.stageKey,
    canceledAt: order.canceledAt?.toISOString() ?? null,
    placedBy: { actorType: order.placedByType, actorId: order.placedById },
    total: formatDecimal(order.total, MONEY),
    note: order.note,
    items: items.map((i) => ({
      id: i.id,
      menuItemId: i.menuItemId,
      name: i.name,
      unitPrice: formatDecimal(i.unitPrice, MONEY),
      quantity: i.quantity,
      lineTotal: formatDecimal(i.lineTotal, MONEY),
    })),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}
