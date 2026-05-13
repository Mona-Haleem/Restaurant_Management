import { Component, Input } from '@angular/core';
import { Order } from '../../../../../core/models';
import { MatIconModule } from '@angular/material/icon';
import { SummeryItemsPipe } from '../../../../../shared/pipes/summery-items/summery-items.pipe';

const TYPE_ICON: Record<string, string> = {
  'dine-in':  'table_restaurant',
  'pickup':   'takeout_dining',
  'delivery': 'local_shipping',
};

@Component({
  selector: 'app-order-card',
  imports: [MatIconModule, SummeryItemsPipe],
  templateUrl: './order-card.html',
  styleUrl: './order-card.scss',
})
export class OrderCard {
  @Input({ required: true }) order!: Order;
  expected_time = '30 minutes';

  get typeIcon(): string {
    return TYPE_ICON[this.order.type] ?? 'receipt';
  }
}
