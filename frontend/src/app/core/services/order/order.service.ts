import { Injectable } from '@angular/core';
import { CartItem, Order } from '../../models';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class OrderService {
  private orders: BehaviorSubject<Order[]> = new BehaviorSubject<Order[]>([]);

  placeOrder(items: CartItem[], tableNumber: number | 'delivery' | 'pickup'): Observable<Order> {
    const order: Order = {
      _id: crypto.randomUUID(),
      tableNumber,
      items: items.map(item => ({ ...item })),
      status: 'PENDING',
      totalPrice: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      createdBy: 'worker 1', //TODO replaced with logged in user id for tables usally is the cashier 
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    this.orders.next([...this.orders.value, order]);
    return of(order)
  }

  getOrders(): Observable<Order[]> {
    return this.orders.asObservable();

  }

  getOrderById(id: string): Observable<Order | undefined> {
    return of(this.orders.value.find(o => o._id === id));
  }

  updateStatus(id: string, status: Order['status']): Observable<Order> {
    const order = this.orders.value.find(o => o._id === id);
    if (order) {
      if (status === 'CANCELED' && order.status !== 'PENDING') {
        return throwError(() => new Error('Only PENDING orders can be canceled'));
      }
      order.status = status;
      order.updatedAt = new Date().toString();
      this.orders.next([...this.orders.value, order]);
    } else {
      return throwError(() => new Error('Order not found'));
    }

    return of(order);
  }

  cancelOrder(id: string): Observable<Order> {
    const order = this.updateStatus(id, 'CANCELED');
    return order;
  }


}
