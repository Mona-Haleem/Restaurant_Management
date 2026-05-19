import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { OrderService } from '../../../core/services/order/order.service';
import { Order } from '../../../core/models';
import { Observable, of } from 'rxjs';

export const orderTrackingResolver: ResolveFn<Order | undefined> = (route, state): Observable<Order | undefined> => {
  const id = route.queryParamMap.get('id');
  if (!id) return of(undefined);
  return inject(OrderService).getOrderById(id);
};
