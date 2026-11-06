import type { Prisma } from '../../generated/prisma/client';
import type { TenantSeed } from './build-seed';

const skipDuplicates = true;

/**
 * Writes one tenant's seed rows, inserting only rows that are missing: every row has a
 * deterministic id, and `createMany({ skipDuplicates })` is `INSERT … ON CONFLICT DO NOTHING`,
 * so a second run changes nothing (B401 acceptance). Call inside one transaction per tenant.
 *
 * ADR 0016: this is the only code besides the ledger service that writes ledger rows and
 * `branch_stock.current_stock`. It writes both in the same transaction, from rows built so that
 * stock = snapshot + ledger since.
 */
export async function writeTenantSeed(
  tx: Prisma.TransactionClient,
  seed: TenantSeed,
): Promise<void> {
  await tx.tenant.createMany({ data: [seed.tenant], skipDuplicates });
  await tx.branch.createMany({ data: seed.branches, skipDuplicates });
  await tx.user.createMany({ data: seed.users, skipDuplicates });
  await tx.orderWorkflowStage.createMany({ data: seed.stages, skipDuplicates });
  await tx.category.createMany({ data: seed.categories, skipDuplicates });
  await tx.inventoryItem.createMany({ data: seed.inventoryItems, skipDuplicates });
  await tx.inventoryItemComponent.createMany({ data: seed.components, skipDuplicates });
  await tx.menuItem.createMany({ data: seed.menuItems, skipDuplicates });
  await tx.menuItemIngredient.createMany({ data: seed.ingredients, skipDuplicates });
  await tx.order.createMany({ data: seed.orders, skipDuplicates });
  await tx.orderItem.createMany({ data: seed.orderItems, skipDuplicates });
  await tx.orderStageHistory.createMany({ data: seed.history, skipDuplicates });

  // Ledger rows get their `seq` at INSERT, in array order (time order, SCHEMA.md).
  await tx.inventoryTransaction.createMany({ data: seed.ledgerBeforeSnapshot, skipDuplicates });

  // A snapshot includes every ledger row of its (branch, item) written so far.
  for (const snapshot of seed.snapshots) {
    const exists = await tx.inventorySnapshot.findUnique({
      where: { id: snapshot.id },
      select: { id: true },
    });
    if (exists) continue;
    const latest = await tx.inventoryTransaction.aggregate({
      _max: { seq: true },
      where: {
        tenantId: snapshot.tenantId,
        branchId: snapshot.branchId,
        inventoryItemId: snapshot.inventoryItemId,
      },
    });
    await tx.inventorySnapshot.create({
      data: { ...snapshot, throughSeq: latest._max.seq ?? 0n },
    });
  }
  await tx.reconciliationEntry.createMany({ data: seed.reconciliations, skipDuplicates });

  await tx.inventoryTransaction.createMany({ data: seed.ledgerAfterSnapshot, skipDuplicates });
  // After both ledger batches, so a waste entry's WASTE row always exists (either side of a count).
  await tx.wasteEntry.createMany({ data: seed.wasteEntries, skipDuplicates });
  await tx.branchStock.createMany({ data: seed.branchStock, skipDuplicates });
}
