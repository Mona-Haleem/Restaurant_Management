import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersController, TrackingController, WorkflowController } from './orders.controller';
import { OrdersService } from './orders.service';

/** B801: workflow stages and the order lifecycle. Deductions go through the ledger (B701). */
@Module({
  imports: [InventoryModule],
  controllers: [WorkflowController, OrdersController, TrackingController],
  providers: [OrdersService],
})
export class OrdersModule {}
