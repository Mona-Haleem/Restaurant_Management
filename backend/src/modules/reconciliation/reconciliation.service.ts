import { Inject, Injectable } from '@nestjs/common';
import { formatDecimal, QUANTITY } from '../../common/decimal/decimal';
import { AppException } from '../../common/errors/app-exception';
import { RequestContextStore } from '../../context/request-context.store';
import { TENANT_DB, type TenantDb } from '../../prisma/tenant-prisma';
import { LedgerService } from '../inventory/ledger.service';
import type { CreateReconciliationDto, ReconciliationDto } from './dto/reconciliation.dto';

/**
 * Reconciliation (B902). The ledger service does the stock work (rule 3: lock, expected stock,
 * ADJUSTMENT for the gap, new snapshot); this service adds one entry per item in the same
 * transaction, so a count is written completely or not at all (ARCHITECTURE §5).
 */
@Injectable()
export class ReconciliationService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantDb,
    private readonly context: RequestContextStore,
    private readonly ledger: LedgerService,
  ) {}

  async createReconciliation(dto: CreateReconciliationDto): Promise<ReconciliationDto> {
    const { tenantId, branchId, actor } = this.context.require();
    if (!branchId) {
      throw new AppException(
        400,
        'BRANCH_REQUIRED',
        'Choose the branch to count (x-dev-branch in Phase 1).',
      );
    }
    if (!actor) {
      // The guard keeps guests out; this only guards the type.
      throw new AppException(401, 'AUTH_REQUIRED', 'This action needs a staff role.');
    }
    const note = dto.note ? dto.note : undefined;

    return this.db.$transaction(async (tx) => {
      const counts = await this.ledger.reconcile(tx, {
        branchId,
        actorId: actor.id,
        note,
        counts: dto.counts,
      });
      const entries = [];
      for (const c of counts) {
        // Same branch and item as its ADJUSTMENT row and snapshot (MODEL-MAPPING D22).
        const entry = await tx.reconciliationEntry.create({
          data: {
            tenantId,
            branchId,
            inventoryItemId: c.inventoryItemId,
            countedQuantity: c.countedQuantity,
            expectedQuantity: c.expectedQuantity,
            gap: c.gap,
            adjustmentTransactionId: c.adjustmentTransactionId,
            snapshotId: c.snapshotId,
            actorId: actor.id,
            note: note ?? null,
          },
        });
        entries.push({ entry, count: c });
      }
      return {
        branchId,
        actorId: actor.id,
        note: note ?? null,
        createdAt: entries[0]!.entry.createdAt.toISOString(),
        entries: entries.map(({ entry, count }) => ({
          id: entry.id,
          inventoryItemId: count.inventoryItemId,
          countedQuantity: formatDecimal(count.countedQuantity, QUANTITY),
          expectedQuantity: formatDecimal(count.expectedQuantity, QUANTITY),
          gap: formatDecimal(count.gap, QUANTITY),
          flagged: !count.gap.isZero(),
          adjustmentTransactionId: count.adjustmentTransactionId,
          snapshotId: count.snapshotId,
          stockAfter: formatDecimal(count.stockAfter, QUANTITY),
        })),
      };
    });
  }
}
