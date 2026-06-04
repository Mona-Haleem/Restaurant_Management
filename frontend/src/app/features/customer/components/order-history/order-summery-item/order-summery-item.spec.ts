import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { OrderSummeryItem } from './order-summery-item';
import { CartService } from '../../../../../core/services/cart/cart.service';
import { vi } from 'vitest';
import { CartItem } from '../../../../../core/models';
import { ComponentRef } from '@angular/core';

describe('OrderSummeryItem', () => {
  let component: OrderSummeryItem;
  let componentRef: ComponentRef<OrderSummeryItem>;
  let fixture: ComponentFixture<OrderSummeryItem>;
  let cartServiceStub: Partial<CartService>;

  const mockItem: CartItem = {
    _id: 'item-1',
    name: 'Margherita Pizza',
    description: 'Classic cheese pizza',
    price: 100,
    category: 'Pizza',
    isAvailable: true,
    ingredients: [],
    quantity: 2,
    imageUrl: 'pizza.jpg',
    addtions: ['Extra Cheese', 'Olives']
  };

  beforeEach(async () => {
    cartServiceStub = {
      addToCart: vi.fn(),
      removeFromCart: vi.fn(),
      removeItem: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [OrderSummeryItem],
      providers: [
        { provide: CartService, useValue: cartServiceStub }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(OrderSummeryItem);
    component = fixture.componentInstance;
    componentRef = fixture.componentRef;
    
    // Required input
    componentRef.setInput('item', mockItem);
    fixture.detectChanges();
  });

  // ── Rendering ────────────────────────────────────────────────────────────

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display the item name, image, and formatted additions', () => {
    const img = fixture.debugElement.query(By.css('img')).nativeElement;
    expect(img.src).toContain('pizza.jpg');
    expect(img.alt).toBe('Margherita Pizza');

    const nameEl = fixture.debugElement.query(By.css('.item-name')).nativeElement;
    expect(nameEl.textContent).toContain('Margherita Pizza');

    // SummeryItemsPipe formats the array as comma-separated string
    const additionsEl = fixture.debugElement.query(By.css('.item-content')).nativeElement;
    expect(additionsEl.textContent).toContain('Extra Cheese, Olives');
  });

  it('should display the correct total price (price × quantity)', () => {
    const priceEl = fixture.debugElement.query(By.css('.item-price')).nativeElement;
    // 100 * 2 = 200
    expect(priceEl.textContent).toContain('200.00');
  });

  // ── Default View ─────────────────────────────────────────────────────────

  describe('Default View', () => {
    beforeEach(() => {
      componentRef.setInput('view', 'default');
      fixture.detectChanges();
    });

    it('should render quantity controls (+ and - buttons) and delete button', () => {
      const addBtn = fixture.debugElement.query(By.css('button[data-testid="add-item-btn"]'));
      expect(addBtn).toBeTruthy();

      // There are two buttons with remove-item-btn data-testid, one is '-' and one is delete.
      const removeBtns = fixture.debugElement.queryAll(By.css('button[data-testid="remove-item-btn"]'));
      expect(removeBtns.length).toBe(2);
      
      const qtyText = fixture.debugElement.query(By.css('.item-info .item-quantity')).nativeElement;
      expect(qtyText.textContent).toContain('2x');
    });

    it('should apply .lg class to image and total div', () => {
      const img = fixture.debugElement.query(By.css('img')).nativeElement;
      expect(img.classList.contains('lg')).toBe(true);

      const totalDiv = fixture.debugElement.query(By.css('.item-total')).nativeElement;
      expect(totalDiv.classList.contains('lg')).toBe(true);
    });

    it('should call CartService.addToCart when + button is clicked', () => {
      const addBtn = fixture.debugElement.query(By.css('button[data-testid="add-item-btn"]'));
      addBtn.nativeElement.click();
      expect(cartServiceStub.addToCart).toHaveBeenCalledWith(mockItem);
    });

    it('should call CartService.removeFromCart when - button is clicked', () => {
      const minusBtn = fixture.debugElement.query(By.css('.btn-outline-primary.btn-sm[data-testid="remove-item-btn"]'));
      minusBtn.nativeElement.click();
      expect(cartServiceStub.removeFromCart).toHaveBeenCalledWith('item-1');
    });

    it('should call CartService.removeItem when delete button is clicked', () => {
      const deleteBtn = fixture.debugElement.query(By.css('.btn-text-primary.btn-sm[data-testid="remove-item-btn"]'));
      deleteBtn.nativeElement.click();
      expect(cartServiceStub.removeItem).toHaveBeenCalledWith('item-1');
    });
  });

  // ── Readonly View ────────────────────────────────────────────────────────

  describe('Readonly View', () => {
    beforeEach(() => {
      componentRef.setInput('view', 'readonly');
      fixture.detectChanges();
    });

    it('should NOT render quantity controls or delete button', () => {
      const addBtn = fixture.debugElement.query(By.css('button[data-testid="add-item-btn"]'));
      expect(addBtn).toBeFalsy();

      const removeBtns = fixture.debugElement.queryAll(By.css('button[data-testid="remove-item-btn"]'));
      expect(removeBtns.length).toBe(0);
    });

    it('should NOT apply .lg class to image or total div', () => {
      const img = fixture.debugElement.query(By.css('img')).nativeElement;
      expect(img.classList.contains('lg')).toBe(false);

      const totalDiv = fixture.debugElement.query(By.css('.item-total')).nativeElement;
      expect(totalDiv.classList.contains('lg')).toBe(false);
    });

    it('should display the quantity as plain text', () => {
      const qtyEl = fixture.debugElement.query(By.css('.item-qty')).nativeElement;
      expect(qtyEl.textContent).toContain('QTY:2');
    });
  });
});
