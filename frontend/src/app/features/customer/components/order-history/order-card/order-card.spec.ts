import { render, screen } from '@testing-library/angular';
import { OrderCard } from './order-card';
import { Order } from '../../../../../core/models';

describe('OrderCard', () => {
  const mockOrder: Order = {
    _id: '999888',
    userId: 'user-1',
    type: 'dine-in',
    location: 10,
    status: 'DELIVERED',
    items: [
      {
        _id: 'item-2',
        name: 'Pizza',
        description: 'Cheese Pizza',
        imageUrl: 'pizza.png',
        price: 150,
        quantity: 1,
        category: 'Pizza',
        isAvailable: true,
        ingredients: [],
        addtions: ['Extra Cheese'],
      },
    ],
    totalPrice: 150,
    createdBy: 'system',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('should render the order ID', async () => {
    await render(OrderCard, { inputs: { order: mockOrder } });
    expect(screen.getByText('#999888')).toBeTruthy();
  });

  it('should render the order items summary', async () => {
    await render(OrderCard, { inputs: { order: mockOrder } });
    expect(screen.getByText('Pizza x1')).toBeTruthy();
  });

  it('should render the expected time', async () => {
    await render(OrderCard, { inputs: { order: mockOrder } });
    expect(screen.getByText(/30 minutes/i)).toBeTruthy();
  });

  it('should render the order status', async () => {
    await render(OrderCard, { inputs: { order: mockOrder } });
    expect(screen.getByText('DELIVERED')).toBeTruthy();
  });

  it('should display table_restaurant icon and "TABLE {location}" for dine-in orders', async () => {
    await render(OrderCard, { inputs: { order: mockOrder } });
    expect(screen.getByText('table_restaurant')).toBeTruthy();
    expect(screen.getByText('TABLE 10')).toBeTruthy();
  });

  it('should display takeout_dining icon and "pickup" for pickup orders', async () => {
    const pickupOrder = { ...mockOrder, type: 'pickup', location: 'pickup' } as Order;
    await render(OrderCard, { inputs: { order: pickupOrder } });
    expect(screen.getByText('takeout_dining')).toBeTruthy();
    expect(screen.getByText('pickup')).toBeTruthy();
  });

  it('should display local_shipping icon and "delivery" for delivery orders', async () => {
    const deliveryOrder = { ...mockOrder, type: 'delivery', location: '123 Main St' } as Order;
    await render(OrderCard, { inputs: { order: deliveryOrder } });
    expect(screen.getByText('local_shipping')).toBeTruthy();
    expect(screen.getByText('delivery')).toBeTruthy();
  });
});
