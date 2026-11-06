import { AppException } from '../../common/errors/app-exception';
import { parseDecimal } from '../../common/decimal/decimal';
import type { RequestContext } from '../../context/request-context';
import { RequestContextStore } from '../../context/request-context.store';
import type { TenantDb } from '../../prisma/tenant-prisma';
import type { LedgerService } from '../inventory/ledger.service';
import { WasteService } from './waste.service';

// Unit tests for the service's own decisions: branch and actor come from the context, the ledger
// row and the entry share one transaction, and the entry links to the ledger row. Real stock,
// ledger rows and rollback on Postgres are proven in test/waste.e2e-spec.ts.

const CTX: RequestContext = {
  tenantId: 'tenant-a',
  tenantSlug: 'nile-bites',
  tenantName: 'Nile Bites',
  isDemoTenant: true,
  branchId: 'branch-1',
  actor: { id: 'worker-1', name: 'Omar', role: 'WORKER' },
};
const DTO = { inventoryItemId: 'item-1', quantity: '500', unit: 'G' as const, reason: 'Burnt' };
const CREATED_AT = new Date('2026-11-06T10:00:00Z');

function setup() {
  const tx = {
    wasteEntry: {
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'waste-1', createdAt: CREATED_AT, ...args.data }),
      ),
    },
  };
  const db = { $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)) };
  const ledger = {
    recordWaste: jest.fn().mockResolvedValue({
      transactionId: 'txn-1',
      inventoryItemId: 'item-1',
      quantityDelta: parseDecimal('-0.5'),
      stockAfter: parseDecimal('-0.25'),
      negative: true,
    }),
  };
  const store = new RequestContextStore();
  const service = new WasteService(
    db as unknown as TenantDb,
    store,
    ledger as unknown as LedgerService,
  );
  const run = <T>(fn: () => Promise<T>, ctx: RequestContext = CTX) => store.run(ctx, fn);
  return { tx, db, ledger, service, run };
}

describe('WasteService.logWaste', () => {
  it('records the WASTE row and the entry in one transaction, with branch and actor from the context', async () => {
    const { tx, db, ledger, service, run } = setup();
    const result = await run(() => service.logWaste(DTO));

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(ledger.recordWaste).toHaveBeenCalledWith(tx, {
      branchId: 'branch-1',
      inventoryItemId: 'item-1',
      quantity: '500',
      unit: 'G',
      actorId: 'worker-1',
      reason: 'Burnt',
    });
    expect(tx.wasteEntry.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-a',
        branchId: 'branch-1',
        inventoryItemId: 'item-1',
        quantity: parseDecimal('500'),
        unit: 'G',
        reason: 'Burnt',
        transactionId: 'txn-1',
        actorId: 'worker-1',
      },
    });
    expect(result).toEqual({
      id: 'waste-1',
      branchId: 'branch-1',
      inventoryItemId: 'item-1',
      quantity: '500.000',
      unit: 'G',
      reason: 'Burnt',
      transactionId: 'txn-1',
      actorId: 'worker-1',
      createdAt: '2026-11-06T10:00:00.000Z',
      quantityDelta: '-0.500',
      stockAfter: '-0.250',
      negative: true,
    });
  });

  it('refuses a caller with no branch (an ADMIN of a multi-branch tenant) before writing', async () => {
    const { ledger, service, run } = setup();
    const error = await run(() => service.logWaste(DTO), {
      ...CTX,
      branchId: null,
      actor: { id: 'admin-1', name: 'Karim', role: 'ADMIN' },
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(400);
    expect((error as AppException).code).toBe('BRANCH_REQUIRED');
    expect(ledger.recordWaste).not.toHaveBeenCalled();
  });

  it('refuses a caller with no actor (the guard normally stops guests first)', async () => {
    const { ledger, service, run } = setup();
    await expect(run(() => service.logWaste(DTO), { ...CTX, actor: null })).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
    expect(ledger.recordWaste).not.toHaveBeenCalled();
  });

  it('propagates a ledger refusal without creating the entry', async () => {
    const { tx, ledger, service, run } = setup();
    ledger.recordWaste.mockRejectedValue(
      new AppException(400, 'MIXED_ITEM_NOT_STOCKED', 'Mixed.', {}),
    );
    await expect(run(() => service.logWaste(DTO))).rejects.toMatchObject({
      code: 'MIXED_ITEM_NOT_STOCKED',
    });
    expect(tx.wasteEntry.create).not.toHaveBeenCalled();
  });
});
