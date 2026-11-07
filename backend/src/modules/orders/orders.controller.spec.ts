import type { OrderQueriesService } from './order-queries.service';
import { OrdersController, TrackingController, WorkflowController } from './orders.controller';
import type { OrdersService } from './orders.service';
import type { PollResponse } from './poll-reply';

// The controllers are thin: each route hands its input to one service call (CLAUDE.md).

function fakeResponse(): PollResponse & { headers: Record<string, string>; code: number } {
  const res = {
    headers: {} as Record<string, string>,
    code: 200,
    setHeader(name: string, value: string) {
      res.headers[name] = value;
    },
    status(code: number) {
      res.code = code;
    },
  };
  return res;
}

describe('orders controllers', () => {
  const service = {
    getWorkflow: jest.fn().mockResolvedValue('workflow'),
    placeOrder: jest.fn().mockResolvedValue('placed'),
    advanceOrder: jest.fn().mockResolvedValue('advanced'),
    cancelOrder: jest.fn().mockResolvedValue('cancelled'),
    cancelTrackedOrder: jest.fn().mockResolvedValue('guest cancelled'),
  };
  const queries = {
    listOrders: jest.fn().mockResolvedValue({ etag: 'W/"list"', body: ['o'] }),
    getOrder: jest.fn().mockResolvedValue({ etag: 'W/"one"', body: null }),
    getTrackedOrder: jest.fn().mockResolvedValue({ etag: 'W/"track"', body: { stageKey: 's' } }),
  };
  const orders = service as unknown as OrdersService;
  const q = queries as unknown as OrderQueriesService;

  it('workflow', async () => {
    await expect(new WorkflowController(orders).getOrderWorkflow()).resolves.toBe('workflow');
  });

  it('orders', async () => {
    const c = new OrdersController(orders, q);
    const dto = { items: [{ menuItemId: 'm', quantity: 1 }] };
    await expect(c.placeOrder(dto)).resolves.toBe('placed');
    await expect(c.advanceOrder('o1')).resolves.toBe('advanced');
    await expect(c.cancelOrder('o2')).resolves.toBe('cancelled');
    expect(service.placeOrder).toHaveBeenCalledWith(dto);
    expect(service.advanceOrder).toHaveBeenCalledWith('o1');
    expect(service.cancelOrder).toHaveBeenCalledWith('o2');
  });

  it('lists with the ETag and no-cache headers', async () => {
    const res = fakeResponse();
    await expect(
      new OrdersController(orders, q).listOrders({ scope: 'all' }, 'W/"old"', res),
    ).resolves.toEqual(['o']);
    expect(queries.listOrders).toHaveBeenCalledWith({ scope: 'all' }, 'W/"old"');
    expect(res.headers).toEqual({ ETag: 'W/"list"', 'Cache-Control': 'private, no-cache' });
    expect(res.code).toBe(200);
  });

  it('answers 304 with no body when nothing changed', async () => {
    const res = fakeResponse();
    await expect(new OrdersController(orders, q).getOrder('o1', 'W/"one"', res)).resolves.toBe(
      undefined,
    );
    expect(queries.getOrder).toHaveBeenCalledWith('o1', 'W/"one"');
    expect([res.code, res.headers.ETag]).toEqual([304, 'W/"one"']);
  });

  it('tracking', async () => {
    const c = new TrackingController(orders, q);
    await expect(c.cancelTrackedOrder('tok')).resolves.toBe('guest cancelled');
    expect(service.cancelTrackedOrder).toHaveBeenCalledWith('tok');
    const res = fakeResponse();
    await expect(c.getTrackedOrder('tok', undefined, res)).resolves.toEqual({ stageKey: 's' });
    expect(queries.getTrackedOrder).toHaveBeenCalledWith('tok', undefined);
  });
});
