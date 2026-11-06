import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { WasteController } from './waste.controller';
import { WasteService } from './waste.service';

/** B901: waste logging, through the ledger service. */
@Module({
  imports: [InventoryModule],
  controllers: [WasteController],
  providers: [WasteService],
})
export class WasteModule {}
