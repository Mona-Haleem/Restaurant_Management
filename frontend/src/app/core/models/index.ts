// Core models — shared type definitions
// These interfaces are used across services and components

export type UserRole = 'customer' | 'worker' | 'manager';

export interface User {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
}

export type OrderStatus = 'PENDING' | 'IN_PREPARATION' | 'READY' | 'DELIVERED' | 'CANCELED';

export interface MenuItem {
  _id: string;
  name: string;
  description: string;
  price: number;
  discount?: number;  // item-level discount percentage (0–100), e.g. 10 = 10% off
  category: string;
  imageUrl?: string;
  isAvailable: boolean;
  ingredients: { inventoryItemId: string; quantity: number }[];
}

export interface MenuFilter {
  category?: string;
  search?: string;
  isAvailable?: boolean;
}

export interface CartItem extends MenuItem {
  quantity: number;
  addtions?: string[]
}
export type OrderType = 'delivery' | 'pickup' | 'dine-in';
export interface Order {
  _id: string;
  type: OrderType;
  location: string | number;
  items: CartItem[];
  status: OrderStatus;
  totalPrice: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  cancelReason?: string;
}

export interface InventoryItem {
  _id: string;
  name: string;
  unit: string;
  currentStock: number;
  minimumStock: number;
  costPerUnit: number;
}

export interface WasteEntry {
  _id: string;
  inventoryItemId: string;
  inventoryItemName: string;
  quantity: number;
  reason: string;
  loggedBy: string;
  loggedAt: string;
}
