import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { OrderQueriesService } from './order-queries.service';
import { OrdersController, TrackingController, WorkflowController } from './orders.controller';
import { OrdersService } from './orders.service';

/**
 * B801: workflow stages and the order lifecycle. Deductions go through the ledger (B701).
 * B802: board, detail and tracking queries with ETag polling.
 */
@Module({
  imports: [InventoryModule],
  controllers: [WorkflowController, OrdersController, TrackingController],
  providers: [OrdersService, OrderQueriesService],
})
export class OrdersModule {}
