import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CartItemComponent } from './cart-item';

describe('CartItemComponent', () => {
  let component: CartItemComponent;
  let fixture: ComponentFixture<CartItemComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CartItemComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CartItemComponent);
    component = fixture.componentInstance;
    // Provide the required input so it doesn't fail on creation
    component.item = {
      _id: '1',
      name: 'Test',
      description: 'Test',
      price: 10,
      category: 'Test',
      isAvailable: true,
      ingredients: [],
      quantity: 1
    };
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
