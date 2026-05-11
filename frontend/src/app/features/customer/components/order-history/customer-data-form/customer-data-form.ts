import { Component, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { SectionCard } from '../../../../../shared/section-card/section-card';
import { OrderType } from '../../../../../core/models';

interface CustomerData {
  fullName: string;
  phone: string;
  delivery_address: string;
  table_number: number | null;
  type: OrderType
}

@Component({
  selector: 'app-customer-data-form',
  imports: [FormsModule, MatIconModule, SectionCard],
  templateUrl: './customer-data-form.html',
  styleUrl: './customer-data-form.scss',
})
export class CustomerDataForm {
  orderDestination: OrderType = 'dine-in';
  fullName: string = '';
  phone: string = '';
  delivery_address: string = '';
  table_number: number | null = null;
  @Output() submit = new EventEmitter<CustomerData>();

  setOrderType(type: OrderType) {
    this.orderDestination = type;
  }

  onSubmit() {
    this.submit.emit({
      fullName: this.fullName,
      phone: this.phone,
      delivery_address: this.delivery_address,
      table_number: this.table_number,
      type: this.orderDestination,
    });
  }

}
