import { Inject, Injectable } from '@nestjs/common';
import { formatDecimal, parseDecimal, QUANTITY } from '../../common/decimal/decimal';
import { AppException } from '../../common/errors/app-exception';
import { RequestContextStore } from '../../context/request-context.store';
import { TENANT_DB, type TenantDb } from '../../prisma/tenant-prisma';
import { LedgerService } from '../inventory/ledger.service';
import type { LogWasteDto, WasteEntryDto } from './dto/waste.dto';

/**
 * Waste logging (B901). Stock changes only through the ledger service (rule 3): the WASTE row and
 * the waste entry that points at it are written in one transaction, so both exist or neither.
 */
@Injectable()
export class WasteService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantDb,
    private readonly context: RequestContextStore,
    private readonly ledger: LedgerService,
  ) {}

  async logWaste(dto: LogWasteDto): Promise<WasteEntryDto> {
    const { tenantId, branchId, actor } = this.context.require();
    if (!branchId) {
      throw new AppException(
        400,
        'BRANCH_REQUIRED',
        'Choose the branch to log waste in (x-dev-branch in Phase 1).',
      );
    }
    if (!actor) {
      // The guard keeps guests out; this only guards the type.
      throw new AppException(401, 'AUTH_REQUIRED', 'This action needs a staff role.');
    }

    return this.db.$transaction(async (tx) => {
      // The ledger refuses MIXED, archived or unknown items and bad amounts before writing.
      const movement = await this.ledger.recordWaste(tx, {
        branchId,
        inventoryItemId: dto.inventoryItemId,
        quantity: dto.quantity,
        unit: dto.unit,
        actorId: actor.id,
        reason: dto.reason,
      });
      // Same branch, item and actor as its WASTE row (MODEL-MAPPING D22).
      const entry = await tx.wasteEntry.create({
        data: {
          tenantId,
          branchId,
          inventoryItemId: dto.inventoryItemId,
          quantity: parseDecimal(dto.quantity),
          unit: dto.unit,
          reason: dto.reason,
          transactionId: movement.transactionId,
          actorId: actor.id,
        },
      });
      return {
        id: entry.id,
        branchId: entry.branchId,
        inventoryItemId: entry.inventoryItemId,
        quantity: formatDecimal(entry.quantity, QUANTITY),
        unit: entry.unit,
        reason: entry.reason,
        transactionId: entry.transactionId,
        actorId: entry.actorId,
        createdAt: entry.createdAt.toISOString(),
        quantityDelta: formatDecimal(movement.quantityDelta, QUANTITY),
        stockAfter: formatDecimal(movement.stockAfter, QUANTITY),
        negative: movement.negative,
      };
    });
  }
}
