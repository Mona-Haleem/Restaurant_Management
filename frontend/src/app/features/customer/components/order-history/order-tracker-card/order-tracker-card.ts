import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Order } from '../../../../../core/models';

@Component({
  selector: 'app-order-tracker-card',
  imports: [MatIconModule],
  templateUrl: './order-tracker-card.html',
  styleUrl: './order-tracker-card.scss',
})
export class OrderTrackerCard {
  user?: 'customer' | 'worker' | 'manager' = 'customer'
  update?: { time: string, status: string } = undefined
  estimatedTimeOfArrival?: string = '30 minutes'
  orderId?: string = '123'
  @Input() order?: Order;
}
