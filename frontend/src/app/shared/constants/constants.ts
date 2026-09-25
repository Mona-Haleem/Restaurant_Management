export const ORDER_STAGES = {
  PENDING: 'pending',
  IN_PREPARATION: 'in-preparation',
  READY: 'ready',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
} as const;

export const INVENTORY_STATUS = {
  CRITICAL: 'critical',
  OUT_OF_STOCK: 'out-of-stock',
  LOW_STOCK: 'low-stock',
  IN_STOCK: 'in-stock',
  DERIVED: 'derived',
} as const;

export type OrderStage = (typeof ORDER_STAGES)[keyof typeof ORDER_STAGES];
export type InventoryStatus = (typeof INVENTORY_STATUS)[keyof typeof INVENTORY_STATUS];
export const BADGE_STATUS: Record<string, string> = {
  ...ORDER_STAGES,
  ...INVENTORY_STATUS,
} as const;

export * from '../components/status-badge/status-badge.config';
