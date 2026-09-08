import { Injectable, signal } from '@angular/core';
import { CartItem, Order, OrderType } from '../../models';
import { Observable, of, throwError } from 'rxjs';
import { DUMMY_ORDERS } from '../../DummyData/item';

@Injectable({
  providedIn: 'root',
})
export class OrderService {
  // ─── State signal ────────────────────────────────────────────────────────
  orders = signal<Order[]>(DUMMY_ORDERS);

  placeOrder(items: CartItem[], type: OrderType, location: number | string): Observable<Order> {
    const order: Order = {
      _id: crypto.randomUUID(),
      userId: 'customer-123',
      type,
      location,
      items: items.map((item) => ({ ...item })),
      status: 'PENDING',
      totalPrice: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      createdBy: 'worker 1', //TODO replaced with logged in user id for tables usally is the cashier
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.orders.update((list) => [...list, order]);
    return of(order);
  }

  getOrderById(id: string): Observable<Order | undefined> {
    return of(this.orders().find((o) => o._id === id));
  }

  updateStatus(id: string, status: Order['status']): Observable<Order> {
    const order = this.orders().find((o) => o._id === id);
    if (order) {
      if (status === 'CANCELED' && order.status !== 'PENDING') {
        return throwError(() => new Error('Only PENDING orders can be canceled'));
      }
      const updated = { ...order, status, updatedAt: new Date().toString() };
      this.orders.update((list) => list.map((o) => (o._id === id ? updated : o)));
      return of(updated);
    } else {
      return throwError(() => new Error('Order not found'));
    }
  }

  cancelOrder(id: string): Observable<Order> {
    return this.updateStatus(id, 'CANCELED');
  }
}
