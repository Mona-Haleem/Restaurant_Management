import { parseDecimal } from '../../common/decimal/decimal';
import { AppException } from '../../common/errors/app-exception';
import type { RequestContext } from '../../context/request-context';
import { RequestContextStore } from '../../context/request-context.store';
import type { TenantDb } from '../../prisma/tenant-prisma';
import type { LedgerService } from '../inventory/ledger.service';
import { ReconciliationService } from './reconciliation.service';

// Unit tests for the service's own decisions: branch and actor from the context, the ledger work
// and the entries in one transaction, entries linked to their adjustment and snapshot. Real
// stock, locks, snapshots and rollback on Postgres: test/reconciliation.e2e-spec.ts.

const CTX: RequestContext = {
  tenantId: 'tenant-a',
  tenantSlug: 'nile-bites',
  tenantName: 'Nile Bites',
  isDemoTenant: true,
  branchId: 'branch-1',
  actor: { id: 'manager-1', name: 'Salma', role: 'MANAGER' },
};
const CREATED_AT = new Date('2026-11-06T20:00:00Z');
const DTO = {
  counts: [
    { inventoryItemId: 'item-1', quantity: '7.5', unit: 'KG' as const },
    { inventoryItemId: 'item-2', quantity: '3', unit: 'L' as const },
  ],
  note: 'End of day',
};
const D = parseDecimal;

function setup() {
  let n = 0;
  const tx = {
    reconciliationEntry: {
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: `entry-${++n}`, createdAt: CREATED_AT, ...args.data }),
      ),
    },
  };
  const db = { $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)) };
  const ledger = {
    reconcile: jest.fn().mockResolvedValue([
      {
        inventoryItemId: 'item-1',
        countedQuantity: D('7.5'),
        expectedQuantity: D('8'),
        gap: D('-0.5'),
        adjustmentTransactionId: 'adj-1',
        snapshotId: 'snap-1',
        stockAfter: D('7.5'),
      },
      {
        inventoryItemId: 'item-2',
        countedQuantity: D('3'),
        expectedQuantity: D('3'),
        gap: D('0'),
        adjustmentTransactionId: null,
        snapshotId: 'snap-2',
        stockAfter: D('3'),
      },
    ]),
  };
  const store = new RequestContextStore();
  const service = new ReconciliationService(
    db as unknown as TenantDb,
    store,
    ledger as unknown as LedgerService,
  );
  const run = <T>(fn: () => Promise<T>, ctx: RequestContext = CTX) => store.run(ctx, fn);
  return { tx, db, ledger, service, run };
}

describe('ReconciliationService.createReconciliation', () => {
  it('reconciles through the ledger and writes one linked entry per item, in one transaction', async () => {
    const { tx, db, ledger, service, run } = setup();
    const result = await run(() => service.createReconciliation(DTO));

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(ledger.reconcile).toHaveBeenCalledWith(tx, {
      branchId: 'branch-1',
      actorId: 'manager-1',
      note: 'End of day',
      counts: DTO.counts,
    });
    expect(tx.reconciliationEntry.create).toHaveBeenNthCalledWith(1, {
      data: {
        tenantId: 'tenant-a',
        branchId: 'branch-1',
        inventoryItemId: 'item-1',
        countedQuantity: D('7.5'),
        expectedQuantity: D('8'),
        gap: D('-0.5'),
        adjustmentTransactionId: 'adj-1',
        snapshotId: 'snap-1',
        actorId: 'manager-1',
        note: 'End of day',
      },
    });
    expect(result).toEqual({
      branchId: 'branch-1',
      actorId: 'manager-1',
      note: 'End of day',
      createdAt: '2026-11-06T20:00:00.000Z',
      entries: [
        {
          id: 'entry-1',
          inventoryItemId: 'item-1',
          countedQuantity: '7.500',
          expectedQuantity: '8.000',
          gap: '-0.500',
          flagged: true,
          adjustmentTransactionId: 'adj-1',
          snapshotId: 'snap-1',
          stockAfter: '7.500',
        },
        {
          id: 'entry-2',
          inventoryItemId: 'item-2',
          countedQuantity: '3.000',
          expectedQuantity: '3.000',
          gap: '0.000',
          flagged: false,
          adjustmentTransactionId: null,
          snapshotId: 'snap-2',
          stockAfter: '3.000',
        },
      ],
    });
  });

  it('stores an empty note as null', async () => {
    const { ledger, service, run } = setup();
    const result = await run(() => service.createReconciliation({ ...DTO, note: '' }));
    expect(ledger.reconcile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ note: undefined }),
    );
    expect(result.note).toBeNull();
  });

  it.each([
    ['no branch (an ADMIN of a multi-branch tenant)', { branchId: null }, 400, 'BRANCH_REQUIRED'],
    ['no actor', { actor: null }, 401, 'AUTH_REQUIRED'],
  ])('refuses a caller with %s before writing', async (_name, ctx, status, code) => {
    const { ledger, service, run } = setup();
    const error = await run(() => service.createReconciliation(DTO), { ...CTX, ...ctx }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(status);
    expect((error as AppException).code).toBe(code);
    expect(ledger.reconcile).not.toHaveBeenCalled();
  });
});
