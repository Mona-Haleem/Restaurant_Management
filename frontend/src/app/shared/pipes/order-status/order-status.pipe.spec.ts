import { OrderStatusPipe } from './order-status.pipe';
import { OrderStatus } from '../../../core/models';

describe('OrderStatusPipe', () => {
  let pipe: OrderStatusPipe;

  beforeEach(() => {
    pipe = new OrderStatusPipe();
  });

  // ── Creation ────────────────────────────────────────────────────────────

  it('should create an instance', () => {
    expect(pipe).toBeTruthy();
  });

  // ── Status → Display label mapping ──────────────────────────────────────
  // The pipe should transform internal status codes into user-friendly labels.

  it('should transform "PENDING" to "Pending"', () => {
    expect(pipe.transform('PENDING')).toBe('Pending');
  });

  it('should transform "IN_PREPARATION" to "In Preparation"', () => {
    expect(pipe.transform('IN_PREPARATION')).toBe('In Preparation');
  });

  it('should transform "READY" to "Ready"', () => {
    expect(pipe.transform('READY')).toBe('Ready');
  });

  it('should transform "DELIVERED" to "Delivered"', () => {
    expect(pipe.transform('DELIVERED')).toBe('Delivered');
  });

  it('should transform "CANCELED" to "Canceled"', () => {
    expect(pipe.transform('CANCELED')).toBe('Canceled');
  });

  // ── All known statuses covered ──────────────────────────────────────────

  it('should return a non-empty string for every known OrderStatus', () => {
    const statuses: OrderStatus[] = ['PENDING', 'IN_PREPARATION', 'READY', 'DELIVERED', 'CANCELED'];

    for (const status of statuses) {
      const result = pipe.transform(status);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect((result as string).length).toBeGreaterThan(0);
    }
  });

  // ── Edge cases / Defensive handling ─────────────────────────────────────

  it('should return an empty string for an empty string input', () => {
    expect(pipe.transform('')).toBe('');
  });

  it('should return the original value for an unknown status string', () => {
    // Graceful degradation — show the raw value rather than crashing
    expect(pipe.transform('SOME_UNKNOWN_STATUS')).toBe('SOME_UNKNOWN_STATUS');
  });

  // ── CSS class helper (optional second output) ───────────────────────────
  // If a second argument 'css' is passed, return a CSS-safe class name.
  // This is useful for dynamic styling in templates: [class]="order.status | orderStatus:'css'"

  it('should return a CSS-safe class when format argument is "css"', () => {
    expect(pipe.transform('PENDING', 'css')).toBe('status-pending');
    expect(pipe.transform('IN_PREPARATION', 'css')).toBe('status-in-preparation');
    expect(pipe.transform('READY', 'css')).toBe('status-ready');
    expect(pipe.transform('DELIVERED', 'css')).toBe('status-delivered');
    expect(pipe.transform('CANCELED', 'css')).toBe('status-canceled');
  });

  // ── Accessibility ─────────────────────────────────────────────────────
  // Display labels should be screen-reader friendly (no abbreviations, no jargon)

  it('should produce labels that are plain English (no underscores, no ALL_CAPS)', () => {
    const statuses: OrderStatus[] = ['PENDING', 'IN_PREPARATION', 'READY', 'DELIVERED', 'CANCELED'];

    for (const status of statuses) {
      const label = pipe.transform(status) as string;
      expect(label).not.toContain('_');
      // Should not be ALL_CAPS (at least one lowercase letter)
      expect(label).toMatch(/[a-z]/);
    }
  });
});
