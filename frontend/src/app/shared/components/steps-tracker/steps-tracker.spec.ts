import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { StepsTracker } from './steps-tracker';
import { ComponentRef } from '@angular/core';
import { vi } from 'vitest';

describe('StepsTracker', () => {
  let component: StepsTracker;
  let componentRef: ComponentRef<StepsTracker>;
  let fixture: ComponentFixture<StepsTracker>;

  const mockSteps = [
    { isIcon: false, label: 'Info',    icon: '1', isLocked: false },
    { isIcon: false, label: 'Payment', icon: '2', isLocked: true  },
    { isIcon: false, label: 'Review',  icon: '3', isLocked: true  },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StepsTracker]
    }).compileComponents();

    fixture = TestBed.createComponent(StepsTracker);
    component = fixture.componentInstance;
    componentRef = fixture.componentRef;

    componentRef.setInput('steps', mockSteps);
    componentRef.setInput('currentStep', 0);
    fixture.detectChanges();
  });

  // ── Rendering ────────────────────────────────────────────────────────────

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the correct number of step elements', () => {
    const steps = fixture.debugElement.queryAll(By.css('[data-testid^="step-"]'));
    expect(steps.length).toBe(3);
  });

  it('should render the step labels', () => {
    const labels = fixture.debugElement.queryAll(By.css('label'));
    expect(labels[0].nativeElement.textContent).toContain('Info');
    expect(labels[1].nativeElement.textContent).toContain('Payment');
    expect(labels[2].nativeElement.textContent).toContain('Review');
  });

  it('should render the step icon/number text', () => {
    const step0 = fixture.debugElement.query(By.css('[data-testid="step-0"]'));
    expect(step0.nativeElement.textContent).toContain('1');
  });

  // ── Active & Passed Classes ──────────────────────────────────────────────

  it('should mark the current step as "active"', () => {
    const step0 = fixture.debugElement.query(By.css('[data-testid="step-0"]'));
    expect(step0.nativeElement.classList.contains('active')).toBe(true);
  });

  it('should mark steps up to and including currentStep as "passed"', () => {
    componentRef.setInput('currentStep', 1);
    fixture.detectChanges();

    const step0 = fixture.debugElement.query(By.css('[data-testid="step-0"]'));
    const step1 = fixture.debugElement.query(By.css('[data-testid="step-1"]'));
    const step2 = fixture.debugElement.query(By.css('[data-testid="step-2"]'));

    expect(step0.nativeElement.classList.contains('passed')).toBe(true);
    expect(step1.nativeElement.classList.contains('passed')).toBe(true);
    expect(step2.nativeElement.classList.contains('passed')).toBe(false);
  });

  it('should mark only the currentStep as "active" (not previous steps)', () => {
    componentRef.setInput('currentStep', 2);
    fixture.detectChanges();

    const step0 = fixture.debugElement.query(By.css('[data-testid="step-0"]'));
    const step2 = fixture.debugElement.query(By.css('[data-testid="step-2"]'));

    expect(step0.nativeElement.classList.contains('active')).toBe(false);
    expect(step2.nativeElement.classList.contains('active')).toBe(true);
  });

  // ── Progress Bar Width ───────────────────────────────────────────────────

  it('should compute width as 0% when currentStep is 0', () => {
    expect(component.width).toBe(0);
  });

  it('should compute width as 50% when currentStep is 1 of 3', () => {
    componentRef.setInput('currentStep', 1);
    fixture.detectChanges();
    expect(component.width).toBe(50);
  });

  it('should compute width as 100% when currentStep is the last step', () => {
    componentRef.setInput('currentStep', 2);
    fixture.detectChanges();
    expect(component.width).toBe(100);
  });

  // ── Step Click & Lock Logic ──────────────────────────────────────────────

  it('should emit currentStepChange when an unlocked step is clicked', () => {
    const emitSpy = vi.spyOn(component.currentStepChange, 'emit');

    // Step 0 is unlocked
    const step0 = fixture.debugElement.query(By.css('[data-testid="step-0"]'));
    step0.nativeElement.click();

    expect(emitSpy).toHaveBeenCalledWith(0);
  });

  it('should NOT emit currentStepChange when a locked step is clicked', () => {
    const emitSpy = vi.spyOn(component.currentStepChange, 'emit');

    // Step 1 is locked
    const step1 = fixture.debugElement.query(By.css('[data-testid="step-1"]'));
    step1.nativeElement.click();

    expect(emitSpy).not.toHaveBeenCalled();
  });
});
