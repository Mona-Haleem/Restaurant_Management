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
});
