import { render, screen } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';
import { ProgressBar } from './progress-bar';

// Helper: renders a single progress bar with given inputs
async function renderBar(inputs: Record<string, unknown> = {}) {
  return render(ProgressBar, { componentInputs: { ...inputs } });
}

// ─────────────────────────────────────────────────────────────────────────────
describe("ProgressBar — from a user's point of view", () => {
  // ── ARIA / Accessibility ──────────────────────────────────────────────────

  describe('accessibility', () => {
    it('is exposed as a progressbar role with correct ARIA attributes', async () => {
      await renderBar({ value: 60, ariaLabel: 'Food cost margin' });

      const bar = screen.getByRole('progressbar', { name: 'Food cost margin' });
      expect(bar).toBeTruthy();
      expect(bar.getAttribute('aria-valuenow')).toBe('60');
      expect(bar.getAttribute('aria-valuemin')).toBe('0');
      expect(bar.getAttribute('aria-valuemax')).toBe('100');
      expect(bar.getAttribute('aria-valuetext')).toBe('60%');
    });

    it('falls back to label as the accessible name when ariaLabel is omitted', async () => {
      await renderBar({ value: 72, label: 'Stock fill' });

      const bar = screen.getByRole('progressbar', { name: 'Stock fill' });
      expect(bar).toBeTruthy();
    });

    it('clamps over-range value: aria-valuenow is capped at 100', async () => {
      await renderBar({ value: 150, ariaLabel: 'Over-full bar' });

      const bar = screen.getByRole('progressbar');
      expect(bar.getAttribute('aria-valuenow')).toBe('100');
      expect(bar.getAttribute('aria-valuetext')).toBe('100%');
    });

    it('clamps under-range value: aria-valuenow is floored at 0', async () => {
      await renderBar({ value: -20, ariaLabel: 'Negative bar' });

      const bar = screen.getByRole('progressbar');
      expect(bar.getAttribute('aria-valuenow')).toBe('0');
      expect(bar.getAttribute('aria-valuetext')).toBe('0%');
    });
  });

  // ── Label & Value display ─────────────────────────────────────────────────

  describe('label and value display', () => {
    it('shows no label row when neither label nor showValue is set', async () => {
      await renderBar({ value: 50 });

      const label = screen.queryByTestId('pb-label-row');
      expect(label).toBeNull();
      // no text visible — only the track/fill are rendered
      expect(screen.queryByText('%')).toBeNull();
    });

    it('renders the label text when label is provided', async () => {
      await renderBar({ value: 50, label: '50% SLA Compliance' });

      expect(screen.getByText('50% SLA Compliance')).toBeTruthy();
    });

    it('renders the numeric percentage next to the label when showValue is true', async () => {
      await renderBar({ value: 68, label: 'Margin', showValue: true });

      expect(screen.getByText('Margin')).toBeTruthy();
      expect(screen.getByText('68%')).toBeTruthy();
    });

    it('shows the percentage even without a label when showValue is true', async () => {
      await renderBar({ value: 42, showValue: true });

      expect(screen.getByText('42%')).toBeTruthy();
    });
  });

  // ── Auto-variant (default behavior) ──────────────────────────────────────

  describe('auto-variant (default) — colour chosen from value', () => {
    it('applies success variant class for values >= 70', async () => {
      const { fixture } = await renderBar({ value: 85 });

      const host = fixture.nativeElement as HTMLElement;
      expect(host.classList).toContain('variant-success');
    });

    it('applies success variant at the exact 70 boundary', async () => {
      const { fixture } = await renderBar({ value: 70 });

      const host = fixture.nativeElement as HTMLElement;
      expect(host.classList).toContain('variant-success');
    });

    it('applies warning variant for values between 40 and 69', async () => {
      const { fixture } = await renderBar({ value: 55 });

      const host = fixture.nativeElement as HTMLElement;
      expect(host.classList).toContain('variant-warning');
    });

    it('applies warning variant at the exact 40 boundary', async () => {
      const { fixture } = await renderBar({ value: 40 });

      const host = fixture.nativeElement as HTMLElement;
      expect(host.classList).toContain('variant-warning');
    });

    it('applies critical variant for values below 40', async () => {
      const { fixture } = await renderBar({ value: 20 });

      const host = fixture.nativeElement as HTMLElement;
      expect(host.classList).toContain('variant-critical');
    });

    it('applies critical variant at value 0', async () => {
      const { fixture } = await renderBar({ value: 0 });

      const host = fixture.nativeElement as HTMLElement;
      expect(host.classList).toContain('variant-critical');
    });
  });

  // ── Explicit variant override ─────────────────────────────────────────────

  describe('explicit variant override', () => {
    it('uses the explicit "info" variant regardless of value', async () => {
      const { fixture } = await renderBar({ value: 90, variant: 'info' });

      const host = fixture.nativeElement as HTMLElement;
      expect(host.classList).toContain('variant-info');
      expect(host.classList).not.toContain('variant-success');
    });

    it('uses the explicit "neutral" variant regardless of value', async () => {
      const { fixture } = await renderBar({ value: 20, variant: 'neutral' });

      const host = fixture.nativeElement as HTMLElement;
      expect(host.classList).toContain('variant-neutral');
      expect(host.classList).not.toContain('variant-critical');
    });

    it('uses explicit "success" variant even for a low value', async () => {
      const { fixture } = await renderBar({ value: 10, variant: 'success' });

      const host = fixture.nativeElement as HTMLElement;
      expect(host.classList).toContain('variant-success');
    });

    it('uses explicit "critical" variant even for a high value', async () => {
      const { fixture } = await renderBar({ value: 95, variant: 'critical' });

      const host = fixture.nativeElement as HTMLElement;
      expect(host.classList).toContain('variant-critical');
    });
  });

  // ── Size classes ──────────────────────────────────────────────────────────

  describe('size variants', () => {
    it('applies size-sm class by default when size is set to sm', async () => {
      const { fixture } = await renderBar({ value: 50, size: 'sm' });

      expect((fixture.nativeElement as HTMLElement).classList).toContain('size-sm');
    });

    it('applies size-md class when size is md', async () => {
      const { fixture } = await renderBar({ value: 50, size: 'md' });

      expect((fixture.nativeElement as HTMLElement).classList).toContain('size-md');
    });

    it('applies size-lg class when size is lg', async () => {
      const { fixture } = await renderBar({ value: 50, size: 'lg' });

      expect((fixture.nativeElement as HTMLElement).classList).toContain('size-lg');
    });
  });

  // ── Fill width ────────────────────────────────────────────────────────────

  describe('fill width reflects value', () => {
    it('sets the fill element width to the percentage value', async () => {
      const { fixture } = await renderBar({ value: 68 });

      await fixture.whenStable();
      const fill = (fixture.nativeElement as HTMLElement).querySelector('.pb-fill') as HTMLElement;
      expect(fill.style.width).toBe('68%');
    });

    it('caps the fill width at 100% for over-range values', async () => {
      const { fixture } = await renderBar({ value: 200 });

      await fixture.whenStable();
      const fill = (fixture.nativeElement as HTMLElement).querySelector('.pb-fill') as HTMLElement;
      expect(fill.style.width).toBe('100%');
    });

    it('shows 0% fill for a value of 0', async () => {
      const { fixture } = await renderBar({ value: 0 });

      await fixture.whenStable();
      const fill = (fixture.nativeElement as HTMLElement).querySelector('.pb-fill') as HTMLElement;
      expect(fill.style.width).toBe('0%');
    });
  });
});
