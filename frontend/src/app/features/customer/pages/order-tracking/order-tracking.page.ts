import { Component, inject, Input, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Order } from '../../../../core/models';
import { AsyncPipe, JsonPipe, NgIf, UpperCasePipe } from '@angular/common';
import { map, Observable } from 'rxjs';
import { OrderTrackerCard } from '../../components/order-history/order-tracker-card/order-tracker-card';
import { SectionCard } from '../../../../shared/section-card/section-card';
import { OrderSummeryItem } from '../../components/order-history/order-summery-item/order-summery-item';
import { EtaStatus } from '../../components/order-history/eta-status/eta-status';

@Component({
  selector: 'app-order-tracking.page',
  imports: [
    OrderTrackerCard,
    SectionCard,
    OrderSummeryItem,
    EtaStatus,
    UpperCasePipe
  ],
  templateUrl: './order-tracking.page.html',
  styleUrl: './order-tracking.page.scss',
})
export class OrderTrackingPage {
  @Input() order?: Order;
}
