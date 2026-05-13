import { TestBed } from '@angular/core/testing';
import { OrderService } from './order.service';
import { firstValueFrom } from 'rxjs';
import { CartItem, Order } from '../../models';

describe('OrderService', () => {
  let service: OrderService;

  const mockCartItems: CartItem[] = [
    {
      _id: 'm1',
      name: 'Pizza',
      description: 'Cheese pizza',
      price: 10,
      category: 'Main',
      isAvailable: true,
      ingredients: [],
      quantity: 2,
    },
    {
      _id: 'm2',
      name: 'Cola',
      description: 'Cold cola',
      price: 3,
      category: 'Drinks',
      isAvailable: true,
      ingredients: [],
      quantity: 1,
    },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [OrderService],
    });
    service = TestBed.inject(OrderService);
  });

  // ── Creation ────────────────────────────────────────────────────────────

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start with no orders', async () => {
    const orders = await firstValueFrom(service.getOrders());
    expect(orders).toEqual([]);
  });

  // ── placeOrder ──────────────────────────────────────────────────────────

  it('should place an order and return it with status PENDING', async () => {
    const order = await firstValueFrom(
      service.placeOrder(mockCartItems, "dine-in", 5)
    );

    expect(order).toBeTruthy();
    expect(order.status).toBe('PENDING');
    expect(order.location).toBe(5);
    expect(order._id).toBeTruthy();
  });

  it('should calculate totalPrice from cart items (price × quantity)', async () => {
    // Pizza: 10 × 2 = 20, Cola: 3 × 1 = 3 → total = 23
    const order = await firstValueFrom(
      service.placeOrder(mockCartItems, "dine-in", 5)
    );

    expect(order.totalPrice).toBe(23);
  });

  it('should map cart items into the order items array', async () => {
    const order = await firstValueFrom(
      service.placeOrder(mockCartItems, "dine-in", 5)
    );

    expect(order.items.length).toBe(2);
    expect(order.items[0].quantity).toBe(2);
    expect(order.items[1].quantity).toBe(1);
  });

  it('should add the placed order to the orders list', async () => {
    await firstValueFrom(service.placeOrder(mockCartItems, "dine-in", 5));

    const orders = await firstValueFrom(service.getOrders());
    expect(orders.length).toBe(1);
  });

  it('should generate unique IDs for each order', async () => {
    const order1 = await firstValueFrom(service.placeOrder(mockCartItems, "dine-in", 1));
    const order2 = await firstValueFrom(service.placeOrder(mockCartItems, "dine-in", 2));

    expect(order1._id).not.toBe(order2._id);
  });

  // ── getOrderById ────────────────────────────────────────────────────────

  it('should retrieve an order by its ID', async () => {
    const placed = await firstValueFrom(service.placeOrder(mockCartItems, "dine-in", 3));
    const found = await firstValueFrom(service.getOrderById(placed._id));

    expect(found).toBeTruthy();
    expect(found!._id).toBe(placed._id);
  });

  it('should return undefined for a non-existent order ID', async () => {
    const found = await firstValueFrom(service.getOrderById('does-not-exist'));
    expect(found).toBeUndefined();
  });

  // ── cancelOrder ─────────────────────────────────────────────────────────

  it('should cancel a PENDING order', async () => {
    const placed = await firstValueFrom(service.placeOrder(mockCartItems, "dine-in", 4));
    const canceled = await firstValueFrom(service.cancelOrder(placed._id));

    expect(canceled.status).toBe('CANCELED');
  });

  it('should NOT cancel an order that is not PENDING', async () => {
    // Place and then manually advance to IN_PREPARATION (simulate worker action)
    const placed = await firstValueFrom(service.placeOrder(mockCartItems, "dine-in", 4));
    // We need updateStatus to test this properly — use it if available
    await firstValueFrom(service.updateStatus(placed._id, 'IN_PREPARATION'));

    await expect(
      firstValueFrom(service.cancelOrder(placed._id))
    ).rejects.toThrow();
  });

  // ── updateStatus ────────────────────────────────────────────────────────

  it('should update order status from PENDING to IN_PREPARATION', async () => {
    const placed = await firstValueFrom(service.placeOrder(mockCartItems, "dine-in", 6));
    const updated = await firstValueFrom(
      service.updateStatus(placed._id, 'IN_PREPARATION')
    );

    expect(updated.status).toBe('IN_PREPARATION');
  });

  it('should reflect status changes in getOrders()', async () => {
    const placed = await firstValueFrom(service.placeOrder(mockCartItems, "dine-in", 7));
    await firstValueFrom(service.updateStatus(placed._id, 'READY'));

    const orders = await firstValueFrom(service.getOrders());
    const order = orders.find(o => o._id === placed._id);
    expect(order!.status).toBe('READY');
  });
});
