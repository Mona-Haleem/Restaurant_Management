import { AsyncPipe, UpperCasePipe } from '@angular/common';
import { Component, inject, Input } from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { StepsTracker } from '../../../../shared/components/steps-tracker/steps-tracker';
import { CustomerDataForm } from '../../components/order-history/customer-data-form/customer-data-form';
import { PaymentForm } from '../../components/order-history/payment-form/payment-form';
import { OrderSummary } from '../../components/order-history/order-summary/order-summary';
import { OrderSummeryItem } from '../../components/order-history/order-summery-item/order-summery-item';
import { EtaStatus } from '../../components/order-history/eta-status/eta-status';
import { SectionCard } from '../../../../shared/section-card/section-card';
import { CartService } from '../../../../core/services/cart/cart.service';
import { OrderService } from '../../../../core/services/order/order.service';
import { OrderType } from '../../../../core/models';
import { CartResolvedData } from '../../resolvers/cart.resolver';

interface CustomerData {
  fullName: string;
  phone: string;
  delivery_address: string;
  table_number: number | null;
  type: OrderType;
}
@Component({
  selector: 'app-checkout',
  imports: [
    StepsTracker, CustomerDataForm, SectionCard, PaymentForm,
    OrderSummary, OrderSummeryItem, EtaStatus, AsyncPipe, MatIconModule
  ],
  templateUrl: './checkout.page.html',
  styleUrl: './checkout.page.scss',
})
export class CheckoutPage {
  private cartService = inject(CartService);
  private orderService = inject(OrderService);
  private router = inject(Router);

  @Input() cartData?: CartResolvedData;

  steps = [
    { isIcon: false, label: 'info', icon: '1', isLocked: false },
    { isIcon: false, label: 'payment', icon: '2', isLocked: true },
    { isIcon: false, label: 'review', icon: '3', isLocked: true },
  ];

  currentStep = 0;
  customerData?: CustomerData;
  paymentMethod: string = 'cash';
  cartItems$ = this.cartService.cartItems$;

  onCustomerData(data: CustomerData) {
    this.customerData = data;
  }

  onPaymentMethodChange(method: string) {
    this.paymentMethod = method;
  }

  onStepChange(step: number) {
    this.steps = this.steps.map((item, index) => {
      if (index <= step) item.isLocked = false;
      return item;
    });
  }

  onPlaceOrder() {
    const items = this.cartService.getCart();
    if (!items.length) return;

    const type = this.customerData?.type ?? 'dine-in';
    const location: string | number =
      type === 'dine-in' ? (this.customerData?.table_number ?? 1) :
        type === 'delivery' ? (this.customerData?.delivery_address ?? '') : 'pickup';

    this.orderService.placeOrder(items, type, location).subscribe(order => {
      this.cartService.clearCart();
      this.router.navigate(['/customer/order'], { queryParams: { id: order._id } });
    });
  }
}
