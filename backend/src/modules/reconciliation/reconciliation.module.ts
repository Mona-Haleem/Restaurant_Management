import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';

/** B902: reconciliation entries, through the ledger service (ADJUSTMENT rows and snapshots). */
@Module({
  imports: [InventoryModule],
  controllers: [ReconciliationController],
  providers: [ReconciliationService],
})
export class ReconciliationModule {}
