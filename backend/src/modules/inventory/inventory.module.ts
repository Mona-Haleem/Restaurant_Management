import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

/**
 * B701: the ledger service, the only writer of stock. B702: stock queries and restock.
 * Orders (B801), waste (B901) and the catalog's menu availability import from here.
 */
@Module({
  controllers: [StockController],
  providers: [LedgerService, StockService],
  exports: [LedgerService, StockService],
})
export class InventoryModule {}
