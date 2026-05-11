import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OrderSummeryItem } from './order-summery-item';

describe('OrderSummeryItem', () => {
  let component: OrderSummeryItem;
  let fixture: ComponentFixture<OrderSummeryItem>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrderSummeryItem],
    }).compileComponents();

    fixture = TestBed.createComponent(OrderSummeryItem);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
