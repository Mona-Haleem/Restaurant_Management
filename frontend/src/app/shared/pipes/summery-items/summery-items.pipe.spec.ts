import { SummeryItemsPipe } from './summery-items.pipe';
import { CartItem } from '../../../core/models';

describe('SummeryItemsPipe', () => {
  let pipe: SummeryItemsPipe;

  beforeEach(() => {
    pipe = new SummeryItemsPipe();
  });

  // ── Creation ────────────────────────────────────────────────────────────

  it('should create an instance', () => {
    expect(pipe).toBeTruthy();
  });

  // ── Normal cases ────────────────────────────────────────────────────────

  it('should join an array of strings with commas', () => {
    expect(pipe.transform(['Pizza', 'Burger', 'Salad'])).toBe('Pizza, Burger, Salad');
  });

  it('should return a single item without a trailing comma', () => {
    expect(pipe.transform(['Pizza'])).toBe('Pizza');
  });

  it('should handle two items correctly', () => {
    expect(pipe.transform(['Fries', 'Cola'])).toBe('Fries, Cola');
  });

  // ── Edge cases ──────────────────────────────────────────────────────────

  it('should return an empty string for an empty array', () => {
    expect(pipe.transform([])).toBe('');
  });



  // ── Type safety ─────────────────────────────────────────────────────────

  it('should handle arrays with empty strings gracefully', () => {
    // Empty strings in the array should still be joined (they exist in the data)
    const result = pipe.transform(['', 'Cola']);
    expect(typeof result).toBe('string');
  });

  it('should always return a string type', () => {
    expect(typeof pipe.transform(['a'])).toBe('string');
    expect(typeof pipe.transform([])).toBe('string');

  });

  // ── Real-world usage: CartItem names ────────────────────────────────────
  // The pipe is used in templates to display a summary of order item names.

  it('should work with a mapped array of CartItem names', () => {
    const items: Partial<CartItem>[] = [
      { name: 'Margherita Pizza' },
      { name: 'Caesar Salad' },
      { name: 'Sparkling Water' },
    ];
    const names = items.map(i => i.name!);
    expect(pipe.transform(names)).toBe('Margherita Pizza, Caesar Salad, Sparkling Water');
  });
});
