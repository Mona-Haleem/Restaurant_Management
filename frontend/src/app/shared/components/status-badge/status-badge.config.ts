export interface StatusConfig {
  key: string;
  statusClass: string;
  label: string;
  icon: string;
}

/**
 * Single source of truth for status colors, labels, and icons.
 * Covers Phase 1 default workflow stages, inventory statuses, and aliases.
 */
export const STATUS_CONFIG_MAP: Record<string, StatusConfig> = {
  pending: {
    key: 'pending',
    statusClass: 'pending',
    label: 'Pending',
    icon: 'schedule',
  },
  'in-preparation': {
    key: 'in-preparation',
    statusClass: 'in-preparation',
    label: 'In Preparation',
    icon: 'soup_kitchen',
  },
  ready: {
    key: 'ready',
    statusClass: 'ready',
    label: 'Ready',
    icon: 'check_circle',
  },
  delivered: {
    key: 'delivered',
    statusClass: 'delivered',
    label: 'Delivered',
    icon: 'task_alt',
  },
  cancelled: {
    key: 'cancelled',
    statusClass: 'cancelled',
    label: 'Cancelled',
    icon: 'cancel',
  },
  'low-stock': {
    key: 'low-stock',
    statusClass: 'low-stock',
    label: 'Low Stock',
    icon: 'warning',
  },
  critical: {
    key: 'critical',
    statusClass: 'critical',
    label: 'Critical',
    icon: 'error',
  },
  'out-of-stock': {
    key: 'out-of-stock',
    statusClass: 'out-of-stock',
    label: 'Out of Stock',
    icon: 'remove_shopping_cart',
  },
  'in-stock': {
    key: 'in-stock',
    statusClass: 'in-stock',
    label: 'In Stock',
    icon: 'inventory_2',
  },
  derived: {
    key: 'derived',
    statusClass: 'derived',
    label: 'Derived',
    icon: 'auto_fix_high',
  },
};

/**
 * Common aliases mapped to canonical keys.
 */
export const STATUS_ALIASES: Record<string, string> = {
  // Phase 1 Order Workflow aliases
  preparing: 'in-preparation',
  in_preparation: 'in-preparation',
  inprep: 'in-preparation',
  'in-prep': 'in-preparation',
  completed: 'delivered',
  complete: 'delivered',
  canceled: 'cancelled',

  // Inventory / Alert aliases
  low_stock: 'low-stock',
  'low stock': 'low-stock',
  'low-stock-waste-alert': 'low-stock',
  out_of_stock: 'out-of-stock',
  'out of stock': 'out-of-stock',
  in_stock: 'in-stock',
  'in stock': 'in-stock',
};

/**
 * Formats a raw key into a readable Title Case string.
 * E.g. 'quality-check' -> 'Quality Check', 'waiting_approval' -> 'Waiting Approval'
 */
export function formatStageLabel(rawKey: string): string {
  if (!rawKey) return 'Unknown';
  return rawKey.replace(/[-_]+/g, ' ').trim();
}

/**
 * Resolves a stage or inventory status key into its StatusConfig.
 * Handles case insensitivity, underscores/hyphens, and known aliases.
 * Provides a sensible fallback for unrecognized keys (Phase 3 readiness).
 */
export function resolveStatusConfig(rawKey: string | null | undefined): StatusConfig {
  if (!rawKey || typeof rawKey !== 'string') {
    return {
      key: 'unknown',
      statusClass: 'unknown',
      label: 'Unknown',
      icon: 'help_outline',
    };
  }

  const trimmed = rawKey.trim();
  if (!trimmed) {
    return {
      key: 'unknown',
      statusClass: 'unknown',
      label: 'Unknown',
      icon: 'help_outline',
    };
  }

  const lower = trimmed.toLowerCase();
  const normalized = lower.replace(/[\s_]+/g, '-');

  // Direct match in config map
  if (STATUS_CONFIG_MAP[normalized]) {
    return STATUS_CONFIG_MAP[normalized];
  }

  // Check aliases (both normalized and original lowercase)
  const aliasTarget = STATUS_ALIASES[normalized] || STATUS_ALIASES[lower];
  if (aliasTarget && STATUS_CONFIG_MAP[aliasTarget]) {
    return STATUS_CONFIG_MAP[aliasTarget];
  }

  // Fallback for unknown / Phase 3 dynamic stages
  return {
    key: normalized,
    statusClass: 'unknown',
    label: formatStageLabel(trimmed),
    icon: 'help_outline',
  };
}
