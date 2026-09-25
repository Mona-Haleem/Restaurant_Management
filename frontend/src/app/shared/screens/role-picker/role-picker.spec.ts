import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RolePicker } from './role-picker';

describe('RolePicker', () => {
  let component: RolePicker;
  let fixture: ComponentFixture<RolePicker>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RolePicker],
    }).compileComponents();

    fixture = TestBed.createComponent(RolePicker);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
