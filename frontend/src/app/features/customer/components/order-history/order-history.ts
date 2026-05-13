import { Component, inject } from '@angular/core';
import { OrderService } from '../../../../core/services/order/order.service';
import { AsyncPipe } from '@angular/common';

@Component({
  selector: 'app-order-history',
  imports: [AsyncPipe],
  templateUrl: './order-history.html',
  styleUrl: './order-history.scss',
})
export class OrderHistory {
  private orderService = inject(OrderService
  );

  orders$ = this.orderService.getOrders();
}
