// Core models — shared type definitions
// These interfaces are used across services and components

import { OrderSummaryData } from "../services/cart/cart.service";

export type UserRole = 'customer' | 'worker' | 'manager';

export interface User {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
}
export const OrderStatusList = ['PENDING', 'IN_PREPARATION', 'READY', 'DELIVERED', 'CANCELED'] as const;
export type OrderStatus = typeof OrderStatusList[number];

export const statusIcons: { [key in OrderStatus]: string } = {
  'PENDING': 'schedule',
  'IN_PREPARATION': 'restaurant',
  'READY': 'check_circle',
  'DELIVERED': 'home',
  'CANCELED': 'cancel',
}
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
  userId: string;
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

export interface CustomerData {
  fullName: string;
  phone: string;
  location: string | null;
  type: OrderType;
  paymentMethod?: string;
  pricing?: OrderSummaryData
}
export type PaymentData = {
  coupons?: string;
  type: "cash"
} | {
  coupons?: string;
  type: "card";
  cardData: {
    name: string;
    number: string;
    expiry_date: string;
    cvv: string;
  }
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
