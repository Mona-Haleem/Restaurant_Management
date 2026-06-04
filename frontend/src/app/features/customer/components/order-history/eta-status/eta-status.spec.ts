import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { EtaStatus } from './eta-status';
import { ComponentRef } from '@angular/core';

describe('EtaStatus', () => {
  let component: EtaStatus;
  let componentRef: ComponentRef<EtaStatus>;
  let fixture: ComponentFixture<EtaStatus>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EtaStatus]
    }).compileComponents();

    fixture = TestBed.createComponent(EtaStatus);
    component = fixture.componentInstance;
    componentRef = fixture.componentRef;
    
    // Test binding using setInput (requires @Input decorators in component)
    componentRef.setInput('currentLoad', 5);
    componentRef.setInput('expectedPrepTime', 15);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the current load bound via @Input()', () => {
    const loadEl = fixture.debugElement.query(By.css('[data-testid="current-load"]')).nativeElement;
    expect(loadEl.textContent.trim()).toBe('5');
  });

  it('should render the expected prep time bound via @Input()', () => {
    const timeEl = fixture.debugElement.query(By.css('[data-testid="expected-time"]')).nativeElement;
    expect(timeEl.textContent.trim()).toBe('15');
  });

  it('should update the view when Inputs change', () => {
    componentRef.setInput('currentLoad', 8);
    componentRef.setInput('expectedPrepTime', 20);
    fixture.detectChanges();

    const loadEl = fixture.debugElement.query(By.css('[data-testid="current-load"]')).nativeElement;
    expect(loadEl.textContent.trim()).toBe('8');

    const timeEl = fixture.debugElement.query(By.css('[data-testid="expected-time"]')).nativeElement;
    expect(timeEl.textContent.trim()).toBe('20');
  });
});
