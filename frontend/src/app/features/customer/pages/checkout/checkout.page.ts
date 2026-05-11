import { Component } from '@angular/core';
import { StepsTracker } from '../../../../shared/components/steps-tracker/steps-tracker';
import { CustomerDataForm } from '../../components/order-history/customer-data-form/customer-data-form';
import { Order } from '../../../../core/models';
import { OrderSummary } from '../../components/order-history/order-summary/order-summary';
import { OrderSummeryItem } from '../../components/order-history/order-summery-item/order-summery-item';
import { EtaStatus } from '../../components/order-history/eta-status/eta-status';
import { PaymentForm } from '../../components/order-history/payment-form/payment-form';
import { SectionCard } from '../../../../shared/section-card/section-card';

@Component({
  selector: 'app-checkout',
  imports: [StepsTracker, CustomerDataForm, SectionCard, PaymentForm, OrderSummary, OrderSummeryItem, EtaStatus],
  templateUrl: './checkout.page.html',
  styleUrl: './checkout.page.scss',
})
export class CheckoutPage {
  steps = [
    { isIcon: false, label: 'info', icon: "1" },
    { isIcon: false, label: 'details', icon: "2" },
    { isIcon: false, label: 'review', icon: "3" },
  ];
  currentStep = 0;
  order?: Order = {
    items: [
      {
        imageUrl: "/test_recipe_1.png",
        _id: "1",
        name: "pizza",
        price: 10,
        quantity: 2,
        description: "cheese pizza",
        category: "main",
        isAvailable: true,
        ingredients: [],
        addtions: ["cheese", "tomato", "basil"]
      }
    ],
    totalPrice: 20,
    location: 5,
    type: "dine-in",
    createdBy: "xxx",
    updatedAt: "xxx",
    status: "PENDING",
    _id: "1",
    createdAt: "2022-01-01T00:00:00.000Z",


  }
}
