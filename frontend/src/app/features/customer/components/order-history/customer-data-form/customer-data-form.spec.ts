import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CustomerDataForm } from './customer-data-form';

describe('CustomerDataForm', () => {
  let component: CustomerDataForm;
  let fixture: ComponentFixture<CustomerDataForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomerDataForm],
    }).compileComponents();

    fixture = TestBed.createComponent(CustomerDataForm);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
