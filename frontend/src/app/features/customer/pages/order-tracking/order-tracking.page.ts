import { Component, computed, input } from '@angular/core';
import { Order, OrderStatusList } from '../../../../core/models';
import { OrderTrackerCard } from '../../components/order-history/order-tracker-card/order-tracker-card';
import { EtaStatus } from '../../components/order-history/eta-status/eta-status';
import { OrderCard } from '../../components/order-history/order-card/order-card';

@Component({
  selector: 'app-order-tracking.page',
  imports: [OrderTrackerCard, EtaStatus, OrderCard],
  templateUrl: './order-tracking.page.html',
  styleUrl: './order-tracking.page.scss',
})
export class OrderTrackingPage {
  orders = input.required<Order[]>();

  orderHistory = computed(() => {
    return [...this.orders()].sort((a, b) => {
      if (a.status === b.status)
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return OrderStatusList.indexOf(a.status) - OrderStatusList.indexOf(b.status);
    });
  });
}
