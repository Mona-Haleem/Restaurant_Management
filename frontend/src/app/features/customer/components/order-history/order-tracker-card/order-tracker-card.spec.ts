import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { OrderTrackerCard } from './order-tracker-card';
import { OrderService } from '../../../../../core/services/order/order.service';
import { Order } from '../../../../../core/models';
import { vi } from 'vitest';

const mockOrder: Order = {
  _id: '12345',
  userId: 'user1',
  type: 'dine-in',
  location: 5,
  status: 'PENDING',
  items: [
    {
      _id: 'item1',
      name: 'Burger',
      description: 'Burger',
      imageUrl: 'b.jpg',
      price: 50,
      quantity: 2,
      category: 'Burgers',
      isAvailable: true,
      ingredients: [],
      addtions: ['Cheese'],
    },
  ],
  totalPrice: 100,
  createdBy: 'user1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('OrderTrackerCard', () => {
  const setup = async (orderProps: Partial<Order> = {}) => {
    const mockOrderService = {
      cancelOrder: vi.fn(),
    };

    const order = { ...mockOrder, ...orderProps };

    const result = await render(OrderTrackerCard, {
      inputs: { order },
      providers: [{ provide: OrderService, useValue: mockOrderService }],
    });

    return {
      ...result,
      mockOrderService,
    };
  };

  it('renders order details correctly', async () => {
    await setup();
    expect(screen.getByText('#12345')).toBeTruthy();
    expect(screen.getByText('30 minutes')).toBeTruthy();
    // SummeryItemsPipe handles the items array rendering
    expect(screen.getByText(/100\.00/)).toBeTruthy();
  });

  it('shows cancel button when order status is PENDING', async () => {
    await setup({ status: 'PENDING' });
    expect(screen.getByRole('button', { name: /cancel order/i })).toBeTruthy();
  });

  it('does not show cancel button when order status is not PENDING', async () => {
    await setup({ status: 'IN_PREPARATION' });
    expect(screen.queryByRole('button', { name: /cancel order/i })).toBeFalsy();
  });

  it('calls cancelOrder on service when cancel button is clicked', async () => {
    const { mockOrderService } = await setup({ status: 'PENDING' });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /cancel order/i }));

    expect(mockOrderService.cancelOrder).toHaveBeenCalledWith('12345');
  });
});
