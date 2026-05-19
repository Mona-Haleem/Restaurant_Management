import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { OrderService } from '../../../core/services/order/order.service';
import { Order } from '../../../core/models';
import { Observable, take } from 'rxjs';

export const ordersHistoryResolver: ResolveFn<Order[]> = (route, state): Observable<Order[]> => {
  return inject(OrderService).getOrders().pipe(take(1));
};
