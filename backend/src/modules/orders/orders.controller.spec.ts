import { OrdersController, TrackingController, WorkflowController } from './orders.controller';
import type { OrdersService } from './orders.service';

// The controllers are thin: each route hands its input to one service call (CLAUDE.md).

describe('orders controllers', () => {
  const service = {
    getWorkflow: jest.fn().mockResolvedValue('workflow'),
    placeOrder: jest.fn().mockResolvedValue('placed'),
    advanceOrder: jest.fn().mockResolvedValue('advanced'),
    cancelOrder: jest.fn().mockResolvedValue('cancelled'),
    cancelTrackedOrder: jest.fn().mockResolvedValue('guest cancelled'),
  };
  const orders = service as unknown as OrdersService;

  it('workflow', async () => {
    await expect(new WorkflowController(orders).getOrderWorkflow()).resolves.toBe('workflow');
  });

  it('orders', async () => {
    const c = new OrdersController(orders);
    const dto = { items: [{ menuItemId: 'm', quantity: 1 }] };
    await expect(c.placeOrder(dto)).resolves.toBe('placed');
    await expect(c.advanceOrder('o1')).resolves.toBe('advanced');
    await expect(c.cancelOrder('o2')).resolves.toBe('cancelled');
    expect(service.placeOrder).toHaveBeenCalledWith(dto);
    expect(service.advanceOrder).toHaveBeenCalledWith('o1');
    expect(service.cancelOrder).toHaveBeenCalledWith('o2');
  });

  it('tracking', async () => {
    await expect(new TrackingController(orders).cancelTrackedOrder('tok')).resolves.toBe(
      'guest cancelled',
    );
    expect(service.cancelTrackedOrder).toHaveBeenCalledWith('tok');
  });
});
