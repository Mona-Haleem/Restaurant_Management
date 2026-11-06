import { RequestContextStore } from './request-context.store';
import type { RequestContext } from './request-context';

const ctx: RequestContext = {
  tenantId: 't1',
  tenantSlug: 'nile-bites',
  tenantName: 'Nile Bites',
  isDemoTenant: true,
  branchId: 'b1',
  actor: null,
};

describe('RequestContextStore', () => {
  const store = new RequestContextStore();

  it('has no context outside a request', () => {
    expect(store.get()).toBeUndefined();
    expect(() => store.require()).toThrow(/no request context/);
  });

  it('holds the context for the duration of run, including async work', async () => {
    const seen = await store.run(ctx, async () => {
      await new Promise((resolve) => setImmediate(resolve));
      return store.require();
    });
    expect(seen).toBe(ctx);
    expect(store.get()).toBeUndefined();
  });

  it('keeps concurrent requests apart', async () => {
    const other = { ...ctx, tenantId: 't2' };
    const [a, b] = await Promise.all([
      store.run(ctx, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return store.require().tenantId;
      }),
      store.run(other, () => Promise.resolve(store.require().tenantId)),
    ]);
    expect([a, b]).toEqual(['t1', 't2']);
  });
});
