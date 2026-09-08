import { Injectable, signal, computed } from '@angular/core';
import { CartItem, MenuItem } from '../../models';

// ─── Pricing constants (single source of truth) ───────────────────────────────
export const SERVICE_FEE = 10;
export const TAX_RATE = 0.05; // 5%

// ─── Valid coupon codes ────────────────────────────────────────────────────────
const VALID_COUPONS: Record<string, number> = {
  WELCOME10: 10, // 10% off subtotal
  RESTO20: 20, // 20% off subtotal
  FEAST15: 15, // 15% off subtotal
};

// ─── Summary shape returned by cartSummary ───────────────────────────────────
export interface OrderSummaryData {
  subtotal: number; // after item-level discounts
  itemDiscount: number; // savings from item.discount %
  couponDiscount: number; // savings from coupon code
  serviceFee: number;
  tax: number; // 5% on (subtotal - couponDiscount)
  total: number;
}

export interface AppliedCoupon {
  code: string;
  discountPercent: number;
}

/**
 * Pure function – can be called from anywhere (CartService, OrderService,
 * a preview panel, etc.) to compute a consistent order summary.
 *
 * @param items          Cart items (must carry the optional `discount` field)
 * @param couponPercent  Coupon discount as a whole-number percentage (default 0)
 */
export function getSummary(items: CartItem[], couponPercent = 0): OrderSummaryData {
  const rawSubtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemDiscount = items.reduce((sum, item) => {
    return sum + ((item.price * (item.discount ?? 0)) / 100) * item.quantity;
  }, 0);

  const subtotal = +(rawSubtotal - itemDiscount).toFixed(2);
  const couponDiscount = +((subtotal * couponPercent) / 100).toFixed(2);
  const afterCoupon = Math.max(0, subtotal - couponDiscount);
  const tax = +(afterCoupon * TAX_RATE).toFixed(2);
  const total = +(afterCoupon + SERVICE_FEE + tax).toFixed(2);

  return {
    subtotal,
    itemDiscount: +itemDiscount.toFixed(2),
    couponDiscount,
    serviceFee: items.length ? SERVICE_FEE : 0,
    tax,
    total: items.length ? total : 0,
  };
}

@Injectable({ providedIn: 'root' })
export class CartService {
  // ─── State signals ────────────────────────────────────────────────────
  cartItems = signal<CartItem[]>([]);
  coupon = signal<AppliedCoupon | null>(null);

  // ─── Derived computed signals ─────────────────────────────────────────
  cartCount = computed(() => this.cartItems().reduce((sum, item) => sum + item.quantity, 0));
  cartTotal = computed(() => this.cartItems().reduce((t, i) => t + i.price * i.quantity, 0));

  /**
   * Central summary signal – combines live cart + active coupon.
   * Use this wherever a pricing breakdown is needed.
   */
  cartSummary = computed(() => getSummary(this.cartItems(), this.coupon()?.discountPercent ?? 0));

  // ─── Coupon management ───────────────────────────────────────────────

  applyCoupon(code: string): boolean {
    const pct = VALID_COUPONS[code.trim().toUpperCase()];
    if (pct !== undefined) {
      this.coupon.set({ code: code.trim().toUpperCase(), discountPercent: pct });
      return true;
    }
    return false;
  }

  removeCoupon(): void {
    this.coupon.set(null);
  }

  get appliedCoupon(): AppliedCoupon | null {
    return this.coupon();
  }

  // ─── Cart mutations ──────────────────────────────────────────────────

  addToCart(item: MenuItem): void {
    const items = this.cartItems();
    const index = items.findIndex((i) => i._id === item._id);

    if (index > -1) {
      this.cartItems.update((list) => {
        const updated = [...list];
        updated[index] = { ...list[index], quantity: list[index].quantity + 1 };
        return updated;
      });
    } else {
      this.cartItems.update((list) => [...list, { ...item, quantity: 1 }]);
    }
  }

  removeFromCart(id: string): void {
    const items = this.cartItems();
    const index = items.findIndex((i) => i._id === id);

    if (index > -1) {
      const currentQty = items[index].quantity;
      if (currentQty > 1) {
        this.cartItems.update((list) => {
          const updated = [...list];
          updated[index] = { ...list[index], quantity: currentQty - 1 };
          return updated;
        });
      } else {
        this.cartItems.update((list) => list.filter((i) => i._id !== id));
      }
    }
  }

  removeItem(id: string): void {
    this.cartItems.update((list) => list.filter((i) => i._id !== id));
  }

  clearCart(): void {
    this.cartItems.set([]);
    this.coupon.set(null); // reset coupon when cart is cleared
  }

  getCart(): CartItem[] {
    return this.cartItems();
  }
}
