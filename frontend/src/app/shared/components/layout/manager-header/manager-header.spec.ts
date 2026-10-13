import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ManagerHeader } from './manager-header';

describe('ManagerHeader', () => {
  let component: ManagerHeader;
  let fixture: ComponentFixture<ManagerHeader>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManagerHeader],
    }).compileComponents();

    fixture = TestBed.createComponent(ManagerHeader);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
