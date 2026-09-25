import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OrderHistoryPage } from './order-history-page';

describe('OrderHistoryPage', () => {
  let component: OrderHistoryPage;
  let fixture: ComponentFixture<OrderHistoryPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrderHistoryPage],
    }).compileComponents();

    fixture = TestBed.createComponent(OrderHistoryPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
