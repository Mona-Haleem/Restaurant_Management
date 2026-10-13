import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BottomTabs } from './bottom-tabs';

describe('BottomTabs', () => {
  let component: BottomTabs;
  let fixture: ComponentFixture<BottomTabs>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BottomTabs],
    }).compileComponents();

    fixture = TestBed.createComponent(BottomTabs);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
