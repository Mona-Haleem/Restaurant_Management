import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { formatDecimal, MONEY } from '../../common/decimal/decimal';
import { AppException } from '../../common/errors/app-exception';
import { RequestContextStore } from '../../context/request-context.store';
import { TENANT_DB, type TenantDb } from '../../prisma/tenant-prisma';
import type {
  ListOrdersQueryDto,
  OrderDetailDto,
  OrderDto,
  TrackedOrderDto,
} from './dto/order.dto';
import { ITEM_FIELDS, ORDER_FIELDS, toOrderDto } from './orders.service';
import { etagFor, lastStage, matchesIfNoneMatch } from './polling';
import { hashTrackingToken } from './tracking-token';

/** `body: null` means "not modified": the client's If-None-Match still matches `etag`. */
export interface Polled<T> {
  etag: string;
  body: T | null;
}

/** `scope=all` is a history view: newest first, capped. The board (`active`) is not capped. */
export const ALL_SCOPE_LIMIT = 200;

const STAGE_FIELDS = { key: true, label: true, position: true, cancellable: true } as const;

/**
 * B802 order queries for the board, the order detail and guest tracking (ADR 0024). Each answer
 * carries an ETag computed from cheap aggregates; when the caller's If-None-Match still matches,
 * no order row is loaded and the controller replies 304.
 */
@Injectable()
export class OrderQueriesService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantDb,
    private readonly context: RequestContextStore,
  ) {}

  async listOrders(query: ListOrdersQueryDto, ifNoneMatch?: string): Promise<Polled<OrderDto[]>> {
    const { tenantId } = this.context.require();
    const branchId = this.branchFilter(query.branchId);
    const scope = query.scope ?? 'active';
    const stages = await this.db.orderWorkflowStage.findMany({
      orderBy: { position: 'asc' },
      select: { key: true, position: true },
    });
    const filters: Prisma.OrderWhereInput[] = [];
    if (branchId) filters.push({ branchId });
    if (query.stageKey) filters.push({ stageKey: query.stageKey });
    if (scope === 'active') {
      // Finished = in the last stage by position (rule 2: never a stage key literal).
      const last = lastStage(stages);
      filters.push({ canceledAt: null }, ...(last ? [{ stageKey: { not: last.key } }] : []));
    }
    const where: Prisma.OrderWhereInput = { AND: filters };

    // The fingerprint is how the matching orders split over stages (plus how many are
    // cancelled), not only count + latest updated_at: updated_at is set when a statement runs,
    // not when it commits, so a move committing after a newer change could keep the latest
    // value. Every move or cancel changes some count, whatever the commit order (ADR 0024).
    const groups = await this.db.order.groupBy({
      by: ['stageKey'],
      where,
      _count: { _all: true },
      _max: { updatedAt: true },
    });
    const cancelled =
      scope === 'all'
        ? await this.db.order.count({ where: { AND: [...filters, { canceledAt: { not: null } }] } })
        : 0;
    const split = groups
      .map((g) => ({ key: g.stageKey, count: g._count._all, latest: g._max.updatedAt }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const latest = split.reduce<Date | null>(
      (max, g) => (g.latest && (!max || g.latest > max) ? g.latest : max),
      null,
    );
    const etag = etagFor({
      scope: `list:${tenantId}:${branchId ?? '*'}:${scope}:${query.stageKey ?? ''}`,
      count: split.reduce((n, g) => n + g.count, 0),
      latest,
      extra: [
        ...stages.map((s) => `${s.key}@${s.position}`),
        ...split.map((g) => `${g.key}=${g.count}`),
        `cancelled=${cancelled}`,
      ],
    });
    if (matchesIfNoneMatch(ifNoneMatch, etag)) return { etag, body: null };

    const rows = await this.db.order.findMany({
      where,
      orderBy:
        scope === 'active'
          ? [{ createdAt: 'asc' }, { id: 'asc' }]
          : [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(scope === 'all' ? { take: ALL_SCOPE_LIMIT } : {}),
      select: { ...ORDER_FIELDS, items: { orderBy: { id: 'asc' }, select: ITEM_FIELDS } },
    });
    return { etag, body: rows.map(({ items, ...order }) => toOrderDto(order, items)) };
  }

  async getOrder(orderId: string, ifNoneMatch?: string): Promise<Polled<OrderDetailDto>> {
    const { actor, branchId } = this.context.require();
    const isAdmin = actor?.role === 'ADMIN';
    const notFound = (): AppException =>
      new AppException(404, 'ORDER_NOT_FOUND', 'No such order.', { orderId });
    // ADR 0022: WORKER and MANAGER see their own branch only; others' orders do not exist.
    // Staff without a branch see nothing, so no query runs for them.
    if (!isAdmin && !branchId) throw notFound();
    const order = await this.db.order.findFirst({
      where: { id: orderId, ...(isAdmin ? {} : { branchId: branchId! }) },
      select: ORDER_FIELDS,
    });
    if (!order) throw notFound();
    // Every transition updates the order row, so its updated_at covers items and history too.
    const etag = etagFor({ scope: `order:${order.id}`, count: 1, latest: order.updatedAt });
    if (matchesIfNoneMatch(ifNoneMatch, etag)) return { etag, body: null };

    const [items, history] = await Promise.all([
      this.db.orderItem.findMany({
        where: { orderId },
        orderBy: { id: 'asc' },
        select: ITEM_FIELDS,
      }),
      this.db.orderStageHistory.findMany({
        where: { orderId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          action: true,
          fromStageKey: true,
          toStageKey: true,
          actorId: true,
          createdAt: true,
        },
      }),
    ]);
    return {
      etag,
      body: {
        ...toOrderDto(order, items),
        history: history.map((h) => ({
          action: h.action,
          fromStageKey: h.fromStageKey,
          toStageKey: h.toStageKey,
          actorId: h.actorId,
          at: h.createdAt.toISOString(),
        })),
      },
    };
  }

  /** Guest tracking (ADR 0008): the token is the key. An unknown token is a plain 404. */
  async getTrackedOrder(token: string, ifNoneMatch?: string): Promise<Polled<TrackedOrderDto>> {
    const order = await this.db.order.findFirst({
      where: { trackingTokenHash: hashTrackingToken(token) },
      select: ORDER_FIELDS,
    });
    if (!order) throw new AppException(404, 'ORDER_NOT_FOUND', 'No such order.');
    const stages = await this.db.orderWorkflowStage.findMany({
      orderBy: { position: 'asc' },
      select: STAGE_FIELDS,
    });
    const etag = etagFor({
      scope: `track:${order.id}`,
      count: 1,
      latest: order.updatedAt,
      extra: stages.map((s) => `${s.key}@${s.position}:${s.label}:${s.cancellable}`),
    });
    if (matchesIfNoneMatch(ifNoneMatch, etag)) return { etag, body: null };

    const items = await this.db.orderItem.findMany({
      where: { orderId: order.id },
      orderBy: { id: 'asc' },
      select: { name: true, quantity: true, unitPrice: true, lineTotal: true },
    });
    return {
      etag,
      body: {
        stageKey: order.stageKey,
        status: order.canceledAt ? 'cancelled' : order.stageKey,
        canceledAt: order.canceledAt?.toISOString() ?? null,
        total: formatDecimal(order.total, MONEY),
        note: order.note,
        items: items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unitPrice: formatDecimal(i.unitPrice, MONEY),
          lineTotal: formatDecimal(i.lineTotal, MONEY),
        })),
        stages,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      },
    };
  }

  /** ADR 0022: ADMIN may see any branch or pick one; WORKER and MANAGER only their own. */
  private branchFilter(requested: string | undefined): string | null {
    const { actor, branchId } = this.context.require();
    if (actor?.role === 'ADMIN') return requested ?? null;
    if (!branchId) {
      throw new AppException(400, 'BRANCH_REQUIRED', 'This action needs a branch.');
    }
    if (requested && requested !== branchId) {
      throw new AppException(403, 'BRANCH_FORBIDDEN', 'You can only see your own branch.', {
        branchId: requested,
      });
    }
    return branchId;
  }
}
