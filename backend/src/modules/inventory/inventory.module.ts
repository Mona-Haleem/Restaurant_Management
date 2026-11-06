import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';

/** B701: the ledger service, the only writer of stock. Orders (B801) and waste (B901) import it. */
@Module({
  providers: [LedgerService],
  exports: [LedgerService],
})
export class InventoryModule {}
