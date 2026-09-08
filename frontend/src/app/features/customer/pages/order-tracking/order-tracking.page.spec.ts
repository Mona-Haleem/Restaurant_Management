import { render, screen } from '@testing-library/angular';
import { OrderTrackingPage } from './order-tracking.page';
import { Order } from '../../../../core/models';
import { provideRouter } from '@angular/router';

describe('OrderTrackingPage', () => {
  const mockActiveOrder: Order = {
    _id: 'active-1',
    userId: 'u1',
    type: 'dine-in',
    location: 1,
    status: 'PENDING',
    items: [],
    totalPrice: 100,
    createdBy: 'system',
    createdAt: new Date('2026-05-20T10:00:00Z').toISOString(),
    updatedAt: new Date('2026-05-20T10:00:00Z').toISOString(),
  };

  const mockDeliveredOrder: Order = {
    _id: 'delivered-1',
    userId: 'u1',
    type: 'dine-in',
    location: 1,
    status: 'DELIVERED',
    items: [],
    totalPrice: 150,
    createdBy: 'system',
    createdAt: new Date('2026-05-19T10:00:00Z').toISOString(),
    updatedAt: new Date('2026-05-19T11:00:00Z').toISOString(),
  };

  const mockCanceledOrder: Order = {
    _id: 'canceled-1',
    userId: 'u1',
    type: 'dine-in',
    location: 1,
    status: 'CANCELED',
    items: [],
    totalPrice: 50,
    createdBy: 'system',
    createdAt: new Date('2026-05-18T10:00:00Z').toISOString(),
    updatedAt: new Date('2026-05-18T10:30:00Z').toISOString(),
  };

  const setup = async (orders: Order[]) => {
    return await render(OrderTrackingPage, {
      inputs: { orders },
      providers: [provideRouter([])],
    });
  };

  it('renders "Order Not Found" state when orders array is empty', async () => {
    await setup([]);
    expect(screen.getByRole('heading', { level: 2, name: /order not found/i })).toBeTruthy();
    expect(screen.getByText(/we couldn't find the order/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /back to menu/i })).toBeTruthy();
  });

  it('renders active orders correctly', async () => {
    await setup([mockActiveOrder]);
    expect(screen.getByText('#active-1')).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 2, name: /order not found/i })).toBeFalsy();
  });

  it('renders historical orders (DELIVERED, CANCELED)', async () => {
    await setup([mockDeliveredOrder, mockCanceledOrder]);
    expect(screen.getByText('#delivered-1')).toBeTruthy();
    expect(screen.getByText('#canceled-1')).toBeTruthy();
  });

  it('renders both active and historical orders when mixed', async () => {
    await setup([mockActiveOrder, mockDeliveredOrder]);
    expect(screen.getByText('#active-1')).toBeTruthy();
    expect(screen.getByText('#delivered-1')).toBeTruthy();
  });
});
