import { Component, inject, input, OnInit, effect, signal, computed } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Order, OrderStatusList } from '../../../../../core/models';
import { SectionCard } from '../../../../../shared/components/section-card/section-card';
import { StepsTracker } from '../../../../../shared/components/steps-tracker/steps-tracker';
import { SummeryItemsPipe } from '../../../../../shared/pipes/summery-items/summery-items.pipe';
import { CurrencyPipe } from '@angular/common';
import { OrderService } from '../../../../../core/services/order/order.service';

@Component({
  selector: 'app-order-tracker-card',
  imports: [MatIconModule, SummeryItemsPipe, StepsTracker, CurrencyPipe],
  templateUrl: './order-tracker-card.html',
  styleUrl: './order-tracker-card.scss',
})
export class OrderTrackerCard {
  user?: 'customer' | 'worker' | 'manager' = 'customer';
  update?: { time: string; status: string } = undefined;
  estimatedTimeOfArrival?: string = '30 minutes';

  order = input.required<Order>();
  private orderService = inject(OrderService);

  steps = OrderStatusList.filter((status) => status !== 'CANCELED').map((status) => ({
    isIcon: true,
    label: status.split('_').join(' '),
    value: status,
    icon: status,
  }));

  currentStep = signal(0);

  orderItems = computed(() => {
    return this.order().items.map((item) => `${item.name} x${item.quantity}`);
  });

  constructor() {
    effect(() => {
      this.currentStep.set(OrderStatusList.indexOf(this.order().status));
    });
  }

  cancelOrder() {
    this.orderService.cancelOrder(this.order()._id);
  }
}
