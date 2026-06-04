import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { SectionCard } from './section-card';
import { ComponentRef } from '@angular/core';
import { Component } from '@angular/core';

// Host component to test content projection
@Component({
  standalone: true,
  imports: [SectionCard],
  template: `
    <app-section-card title="My Title" subtitle="My Subtitle">
      <button actions data-testid="projected-action">ACTION</button>
      <p data-testid="projected-content">Body Content</p>
    </app-section-card>
  `
})
class TestHostComponent {}

describe('SectionCard', () => {
  let component: SectionCard;
  let componentRef: ComponentRef<SectionCard>;
  let fixture: ComponentFixture<SectionCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SectionCard]
    }).compileComponents();

    fixture = TestBed.createComponent(SectionCard);
    component = fixture.componentInstance;
    componentRef = fixture.componentRef;

    componentRef.setInput('title', 'Test Title');
    componentRef.setInput('subtitle', 'Test Subtitle');
    fixture.detectChanges();
  });

  // ── Basic Rendering ──────────────────────────────────────────────────────

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the title from @Input()', () => {
    const h3 = fixture.debugElement.query(By.css('h3')).nativeElement;
    expect(h3.textContent).toContain('Test Title');
  });

  it('should render the subtitle from @Input()', () => {
    const p = fixture.debugElement.query(By.css('header p')).nativeElement;
    expect(p.textContent).toContain('Test Subtitle');
  });

  it('should update the title when @Input changes', () => {
    componentRef.setInput('title', 'Updated Title');
    fixture.detectChanges();
    const h3 = fixture.debugElement.query(By.css('h3')).nativeElement;
    expect(h3.textContent).toContain('Updated Title');
  });

  it('should render empty subtitle when not provided', () => {
    componentRef.setInput('subtitle', undefined);
    fixture.detectChanges();
    const p = fixture.debugElement.query(By.css('header p')).nativeElement;
    expect(p.textContent.trim()).toBe('');
  });

  // ── Content Projection ───────────────────────────────────────────────────

  it('should project action slot content into the header', async () => {
    const hostFixture = TestBed.createComponent(TestHostComponent);
    hostFixture.detectChanges();
    await hostFixture.whenStable();

    const action = hostFixture.debugElement.query(By.css('[data-testid="projected-action"]'));
    expect(action).toBeTruthy();
    expect(action.nativeElement.textContent).toContain('ACTION');
  });

  it('should project default slot content into the body', async () => {
    const hostFixture = TestBed.createComponent(TestHostComponent);
    hostFixture.detectChanges();
    await hostFixture.whenStable();

    const body = hostFixture.debugElement.query(By.css('[data-testid="projected-content"]'));
    expect(body).toBeTruthy();
    expect(body.nativeElement.textContent).toContain('Body Content');
  });
});
