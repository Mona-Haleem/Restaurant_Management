import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OrdersBoard } from './orders-board';

describe('OrdersBoard', () => {
  let component: OrdersBoard;
  let fixture: ComponentFixture<OrdersBoard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrdersBoard],
    }).compileComponents();

    fixture = TestBed.createComponent(OrdersBoard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
