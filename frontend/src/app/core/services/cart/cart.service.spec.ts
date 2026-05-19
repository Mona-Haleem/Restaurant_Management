import { TestBed } from '@angular/core/testing';
import { CartService } from './cart.service';
import { MenuItem } from '../../models';
import { firstValueFrom } from 'rxjs';

describe('CartService', () => {
  let service: CartService;

  const mockMenuItem: MenuItem = {
    _id: '1',
    name: 'Pizza',
    description: 'Cheese pizza',
    price: 10,
    category: 'Main',
    isAvailable: true,
    ingredients: [],
  };

  const mockMenuItem2: MenuItem = {
    _id: '2',
    name: 'Burger',
    description: 'Beef burger',
    price: 5,
    category: 'Main',
    isAvailable: true,
    ingredients: [],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CartService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with an empty cart', async () => {
    const items = await firstValueFrom(service.cartItems$);
    expect(items).toEqual([]);

    const count = await firstValueFrom(service.count);
    expect(count).toBe(0);

    const total = await firstValueFrom(service.total);
    expect(total).toBe(0);
  });

  it('should add an item to the cart', async () => {
    service.addToCart(mockMenuItem);

    const items = await firstValueFrom(service.cartItems$);
    expect(items.length).toBe(1);
    expect(items[0]._id).toBe('1');
    expect(items[0].quantity).toBe(1);
  });

  it('should increment quantity if the same item is added again', async () => {
    service.addToCart(mockMenuItem);
    service.addToCart(mockMenuItem);

    const items = await firstValueFrom(service.cartItems$);
    expect(items.length).toBe(1);
    expect(items[0].quantity).toBe(2);
  });

  it('should correctly calculate total price and item count', async () => {
    service.addToCart(mockMenuItem); // $10, qty 1
    service.addToCart(mockMenuItem); // $10, qty 2 -> $20
    service.addToCart(mockMenuItem2); // $5, qty 1 -> $5
    // Total should be $25. Item count should be 3.

    const count = await firstValueFrom(service.count);
    expect(count).toBe(3);

    const total = await firstValueFrom(service.total);
    expect(total).toBe(25);
  });

  it('should remove an item from the cart', async () => {
    service.addToCart(mockMenuItem);
    service.addToCart(mockMenuItem2);

    service.removeFromCart('1');

    const items = await firstValueFrom(service.cartItems$);
    expect(items.length).toBe(1);
    expect(items[0]._id).toBe('2');
  });

  it('should decrease quantity if removeOne is called on an item with qty > 1', async () => {
    service.addToCart(mockMenuItem);
    service.addToCart(mockMenuItem);

    service.removeFromCart(mockMenuItem._id);

    const items = await firstValueFrom(service.cartItems$);
    expect(items.length).toBe(1);
    expect(items[0].quantity).toBe(1);
  });

  it('should completely remove the item if removeOne is called and qty is 1', async () => {
    service.addToCart(mockMenuItem);
    service.removeFromCart(mockMenuItem._id);

    const items = await firstValueFrom(service.cartItems$);
    expect(items).toEqual([]);
  });

  it('should clear the cart entirely', async () => {
    service.addToCart(mockMenuItem);
    service.addToCart(mockMenuItem2);
    service.clearCart();

    const items = await firstValueFrom(service.cartItems$);
    expect(items).toEqual([]);
  });
  // ── removeItem ─────────────────────────────────────────────────────────

  it('should completely remove an item regardless of quantity when removeItem is called', async () => {
    service.addToCart(mockMenuItem);
    service.addToCart(mockMenuItem); // qty = 2
    service.removeItem(mockMenuItem._id);

    const items = await firstValueFrom(service.cartItems$);
    expect(items).toEqual([]);
  });

  it('should not affect other items when removeItem is called for a specific item', async () => {
    service.addToCart(mockMenuItem);
    service.addToCart(mockMenuItem2);
    service.removeItem(mockMenuItem._id);

    const items = await firstValueFrom(service.cartItems$);
    expect(items.length).toBe(1);
    expect(items[0]._id).toBe('2');
  });

  // ── Coupon management ─────────────────────────────────────────────────

  it('should start with no applied coupon', () => {
    expect(service.appliedCoupon).toBeNull();
  });

  it('should apply a valid coupon code and return true', () => {
    const result = service.applyCoupon('WELCOME10');
    expect(result).toBe(true);
    expect(service.appliedCoupon).toEqual({ code: 'WELCOME10', discountPercent: 10 });
  });

  it('should reject an invalid coupon code and return false', () => {
    const result = service.applyCoupon('INVALIDCODE');
    expect(result).toBe(false);
    expect(service.appliedCoupon).toBeNull();
  });

  it('should apply coupon codes case-insensitively', () => {
    const result = service.applyCoupon('welcome10');
    expect(result).toBe(true);
    expect(service.appliedCoupon?.code).toBe('WELCOME10');
  });

  it('should trim whitespace from coupon codes', () => {
    const result = service.applyCoupon('  RESTO20  ');
    expect(result).toBe(true);
    expect(service.appliedCoupon?.discountPercent).toBe(20);
  });

  it('should emit the coupon via coupon$ when a valid coupon is applied', async () => {
    service.applyCoupon('FEAST15');
    const coupon = await firstValueFrom(service.coupon$);
    expect(coupon).toEqual({ code: 'FEAST15', discountPercent: 15 });
  });

  it('should remove a coupon and emit null via coupon$', async () => {
    service.applyCoupon('WELCOME10');
    service.removeCoupon();

    expect(service.appliedCoupon).toBeNull();
    const coupon = await firstValueFrom(service.coupon$);
    expect(coupon).toBeNull();
  });

  it('should clear the coupon when the cart is cleared', async () => {
    service.addToCart(mockMenuItem);
    service.applyCoupon('WELCOME10');
    service.clearCart();

    expect(service.appliedCoupon).toBeNull();
    const coupon = await firstValueFrom(service.coupon$);
    expect(coupon).toBeNull();
  });

  // ── getCartSummary() integration ──────────────────────────────────────

  it('should return a summary stream that reflects cart + coupon state', async () => {
    service.addToCart(mockMenuItem);  // $10 × 1
    service.addToCart(mockMenuItem2); // $5 × 1
    // subtotal = 15, no item discounts, no coupon
    // tax = 15 * 0.05 = 0.75, service fee = 10, total = 15 + 10 + 0.75 = 25.75

    const summary = await firstValueFrom(service.getCartSummary());
    expect(summary.subtotal).toBe(15);
    expect(summary.itemDiscount).toBe(0);
    expect(summary.couponDiscount).toBe(0);
    expect(summary.serviceFee).toBe(10);
    expect(summary.tax).toBe(0.75);
    expect(summary.total).toBe(25.75);
  });

  it('should update summary when a coupon is applied', async () => {
    service.addToCart(mockMenuItem);  // $10 × 1
    service.addToCart(mockMenuItem2); // $5 × 1
    service.applyCoupon('WELCOME10'); // 10% off subtotal

    // subtotal = 15, couponDiscount = 1.5, afterCoupon = 13.5
    // tax = 13.5 * 0.05 = 0.675 → 0.68, total = 13.5 + 10 + 0.68 = 24.18
    const summary = await firstValueFrom(service.getCartSummary());
    expect(summary.subtotal).toBe(15);
    expect(summary.couponDiscount).toBe(1.5);
    expect(summary.tax).toBe(0.68);
    expect(summary.total).toBe(24.18);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getSummary() — pure function tests (no Angular TestBed needed)
// ═══════════════════════════════════════════════════════════════════════════

describe('getSummary()', () => {
  const { getSummary, SERVICE_FEE, TAX_RATE } = require('./cart.service');

  // Helper to build a minimal CartItem
  function cartItem(overrides: Record<string, unknown> = {}) {
    return {
      _id: '1',
      name: 'Item',
      description: '',
      price: 10,
      category: 'Main',
      isAvailable: true,
      ingredients: [],
      quantity: 1,
      ...overrides,
    };
  }

  // ── Basic calculations ────────────────────────────────────────────────

  it('should calculate subtotal as sum of (price × quantity) for each item', () => {
    const result = getSummary([
      cartItem({ price: 10, quantity: 2 }),
      cartItem({ _id: '2', price: 5, quantity: 3 }),
    ]);
    // 10×2 + 5×3 = 35
    expect(result.subtotal).toBe(35);
  });

  it('should apply item-level discount percentages', () => {
    const result = getSummary([
      cartItem({ price: 100, quantity: 1, discount: 10 }), // 10% off → save $10
    ]);
    // rawSubtotal = 100, itemDiscount = 10, subtotal = 90
    expect(result.itemDiscount).toBe(10);
    expect(result.subtotal).toBe(90);
  });

  it('should apply coupon discount on the post-item-discount subtotal', () => {
    const result = getSummary(
      [cartItem({ price: 100, quantity: 1 })],
      20 // 20% coupon
    );
    // subtotal = 100, couponDiscount = 20, afterCoupon = 80
    expect(result.couponDiscount).toBe(20);
  });

  it('should calculate tax as 5% on the amount after coupon discount', () => {
    const result = getSummary(
      [cartItem({ price: 100, quantity: 1 })],
      0  // no coupon
    );
    // afterCoupon = 100, tax = 100 * 0.05 = 5
    expect(result.tax).toBe(5);
  });

  it('should include a fixed service fee of $10', () => {
    const result = getSummary([cartItem()]);
    expect(result.serviceFee).toBe(SERVICE_FEE);
    expect(result.serviceFee).toBe(10);
  });

  it('should calculate total as afterCoupon + serviceFee + tax', () => {
    const result = getSummary(
      [cartItem({ price: 50, quantity: 2 })], // subtotal = 100
      10 // 10% coupon → couponDiscount = 10, afterCoupon = 90
    );
    // tax = 90 * 0.05 = 4.5, total = 90 + 10 + 4.5 = 104.5
    expect(result.total).toBe(104.5);
  });

  // ── Item-level discounts ──────────────────────────────────────────────

  it('should handle multiple items with different discount percentages', () => {
    const result = getSummary([
      cartItem({ _id: '1', price: 20, quantity: 2, discount: 25 }), // save $10 (25% of $20 × 2)
      cartItem({ _id: '2', price: 10, quantity: 1, discount: 50 }), // save $5  (50% of $10 × 1)
    ]);
    // rawSubtotal = 40 + 10 = 50
    // itemDiscount = 10 + 5 = 15
    // subtotal = 35
    expect(result.itemDiscount).toBe(15);
    expect(result.subtotal).toBe(35);
  });

  it('should treat items without a discount field as 0% discount', () => {
    const result = getSummary([
      cartItem({ price: 30, quantity: 1 }), // no discount field
    ]);
    expect(result.itemDiscount).toBe(0);
    expect(result.subtotal).toBe(30);
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  it('should return zeroes (except service fee) for an empty cart', () => {
    const result = getSummary([]);
    expect(result.subtotal).toBe(0);
    expect(result.itemDiscount).toBe(0);
    expect(result.couponDiscount).toBe(0);
    expect(result.tax).toBe(0);
    expect(result.serviceFee).toBe(SERVICE_FEE);
    expect(result.total).toBe(SERVICE_FEE);
  });

  it('should not produce a negative afterCoupon amount (floor at 0)', () => {
    // 100% coupon on a $10 cart → afterCoupon should be 0, not negative
    const result = getSummary(
      [cartItem({ price: 10, quantity: 1 })],
      100
    );
    expect(result.couponDiscount).toBe(10);
    expect(result.tax).toBe(0);
    expect(result.total).toBe(SERVICE_FEE); // only service fee remains
  });

  it('should default couponPercent to 0 when not provided', () => {
    const result = getSummary([cartItem({ price: 20, quantity: 1 })]);
    expect(result.couponDiscount).toBe(0);
  });

  // ── Precision (rounding to 2 decimal places) ─────────────────────────

  it('should round all monetary values to 2 decimal places', () => {
    // price 9.99 × qty 3 = 29.97
    // 7% item discount → itemDiscount = 9.99 * 0.07 * 3 = 2.0979
    // subtotal = 29.97 - 2.0979 = 27.8721
    // With 15% coupon → couponDiscount = 27.8721 * 0.15 = 4.180815
    const result = getSummary(
      [cartItem({ price: 9.99, quantity: 3, discount: 7 })],
      15
    );
    // Every value should have at most 2 decimal places
    expect(result.subtotal).toBe(Number(result.subtotal.toFixed(2)));
    expect(result.itemDiscount).toBe(Number(result.itemDiscount.toFixed(2)));
    expect(result.couponDiscount).toBe(Number(result.couponDiscount.toFixed(2)));
    expect(result.tax).toBe(Number(result.tax.toFixed(2)));
    expect(result.total).toBe(Number(result.total.toFixed(2)));
  });

  // ── Combined scenario ─────────────────────────────────────────────────

  it('should correctly compute a full checkout scenario with item discounts + coupon', () => {
    const items = [
      cartItem({ _id: '1', price: 25, quantity: 2, discount: 10 }), // raw=50, save 5 → 45
      cartItem({ _id: '2', price: 15, quantity: 1 }),                // raw=15, save 0 → 15
    ];
    const result = getSummary(items, 20); // 20% coupon

    // rawSubtotal = 65, itemDiscount = 5, subtotal = 60
    expect(result.subtotal).toBe(60);
    expect(result.itemDiscount).toBe(5);

    // couponDiscount = 60 * 0.20 = 12, afterCoupon = 48
    expect(result.couponDiscount).toBe(12);

    // tax = 48 * 0.05 = 2.4
    expect(result.tax).toBe(2.4);

    // total = 48 + 10 + 2.4 = 60.4
    expect(result.total).toBe(60.4);
  });
});
