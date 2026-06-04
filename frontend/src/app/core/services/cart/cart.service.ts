import { Injectable } from "@angular/core";
import { CartItem, MenuItem } from "../../models";
import { BehaviorSubject, combineLatest, map, Observable } from "rxjs";

// ─── Pricing constants (single source of truth) ───────────────────────────────
export const SERVICE_FEE = 10;
export const TAX_RATE = 0.05;   // 5%

// ─── Valid coupon codes ────────────────────────────────────────────────────────
const VALID_COUPONS: Record<string, number> = {
    'WELCOME10': 10,   // 10% off subtotal
    'RESTO20': 20,   // 20% off subtotal
    'FEAST15': 15,   // 15% off subtotal
};

// ─── Summary shape returned by getSummary() ───────────────────────────────────
export interface OrderSummaryData {
    subtotal: number;   // after item-level discounts
    itemDiscount: number;   // savings from item.discount %
    couponDiscount: number;   // savings from coupon code
    serviceFee: number;
    tax: number;   // 5% on (subtotal - couponDiscount)
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

    const rawSubtotal = items.reduce(
        (sum, item) => sum + item.price * item.quantity, 0
    );
    const itemDiscount = items.reduce((sum, item) => {
        return sum + (item.price * (item.discount ?? 0) / 100) * item.quantity;
    }, 0);

    const subtotal = +(rawSubtotal - itemDiscount).toFixed(2);
    const couponDiscount = +(subtotal * couponPercent / 100).toFixed(2);
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
    private cartSubject = new BehaviorSubject<CartItem[]>([]);
    private couponSubject = new BehaviorSubject<AppliedCoupon | null>(null);

    cartItems$ = this.cartSubject.asObservable();
    coupon$ = this.couponSubject.asObservable();

    // ─── Derived streams ─────────────────────────────────────────────────────

    get count(): Observable<number> {
        return this.cartItems$.pipe(
            map(items => items.reduce((sum, item) => sum + item.quantity, 0))
        );
    }

    get total(): Observable<number> {
        return this.cartItems$.pipe(
            map(items => items.reduce((t, i) => t + i.price * i.quantity, 0))
        );
    }

    /**
     * Central summary stream – combines live cart + active coupon.
     * Use this wherever a pricing breakdown is needed.
     */
    getCartSummary(): Observable<OrderSummaryData> {
        return combineLatest([this.cartItems$, this.coupon$]).pipe(
            map(([items, coupon]) => getSummary(items, coupon?.discountPercent ?? 0))
        );
    }

    // ─── Coupon management ───────────────────────────────────────────────────

    applyCoupon(code: string): boolean {
        const pct = VALID_COUPONS[code.trim().toUpperCase()];
        if (pct !== undefined) {
            this.couponSubject.next({ code: code.toUpperCase(), discountPercent: pct });
            return true;
        }
        return false;
    }

    removeCoupon(): void {
        this.couponSubject.next(null);
    }

    get appliedCoupon(): AppliedCoupon | null {
        return this.couponSubject.value;
    }

    // ─── Cart mutations ──────────────────────────────────────────────────────

    addToCart(item: MenuItem): void {
        const items = this.cartSubject.value;
        const index = items.findIndex(i => i._id === item._id);

        if (index > -1) {
            const updatedItems = [...items];
            updatedItems[index] = { ...items[index], quantity: items[index].quantity + 1 };
            this.cartSubject.next(updatedItems);
        } else {
            this.cartSubject.next([...items, { ...item, quantity: 1 }]);
        }
    }

    removeFromCart(id: string): void {
        const items = this.cartSubject.value;
        const index = items.findIndex(i => i._id === id);

        if (index > -1) {
            const updatedItems = [...items];
            const currentQty = updatedItems[index].quantity;

            if (currentQty > 1) {
                updatedItems[index] = { ...updatedItems[index], quantity: currentQty - 1 };
                this.cartSubject.next(updatedItems);
            } else {
                this.cartSubject.next(items.filter(i => i._id !== id));
            }
        }
    }

    removeItem(id: string): void {
        this.cartSubject.next(this.cartSubject.value.filter(i => i._id !== id));
    }

    clearCart(): void {
        this.cartSubject.next([]);
        this.couponSubject.next(null);   // reset coupon when cart is cleared
    }

    getCart(): CartItem[] {
        return this.cartSubject.value;
    }
}