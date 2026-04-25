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
  category: string;
  imageUrl?: string;
  isAvailable: boolean;
  ingredients: { inventoryItemId: string; quantity: number }[];
}

export interface CartItem extends MenuItem {
  quantity: number;
}

export interface Order {
  _id: string;
  tableNumber: number;
  items: { menuItem: MenuItem; quantity: number }[];
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
