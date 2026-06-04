import { Component, Input, OnInit } from '@angular/core';
import { Order, OrderStatusList } from '../../../../core/models';
import { OrderTrackerCard } from '../../components/order-history/order-tracker-card/order-tracker-card';
import { SectionCard } from '../../../../shared/components/section-card/section-card';
import { OrderSummeryItem } from '../../components/order-history/order-summery-item/order-summery-item';
import { EtaStatus } from '../../components/order-history/eta-status/eta-status';
import { OrderCard } from '../../components/order-history/order-card/order-card';
import { CartSidebar } from '../../components/menu/cart-sidebar/cart-sidebar';

@Component({
  selector: 'app-order-tracking.page',
  imports: [
    OrderTrackerCard,
    
    EtaStatus,
    OrderCard,
  ],
  templateUrl: './order-tracking.page.html',
  styleUrl: './order-tracking.page.scss',
})
export class OrderTrackingPage implements OnInit {
  @Input({ required: true }) orders!: Order[];
  orderHistory: Order[] = [];

  ngOnInit() {
    this.orderHistory = [...this.orders].sort((a, b) => {
      if (a.status === b.status)
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return OrderStatusList.indexOf(a.status) - OrderStatusList.indexOf(b.status);
    });
  }
}