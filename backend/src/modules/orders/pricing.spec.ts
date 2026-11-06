import { parseDecimal } from '../../common/decimal/decimal';
import { priceOrder } from './pricing';

const menu = new Map([
  ['burger', { name: 'Classic Burger', price: parseDecimal('185.50') }],
  ['tea', { name: 'Mint Tea', price: parseDecimal('0.10') }],
  ['free', { name: 'Water', price: parseDecimal('0') }],
]);

describe('priceOrder (pure)', () => {
  it('copies name and unit price, and multiplies exactly (no float drift)', () => {
    const priced = priceOrder(
      [
        { menuItemId: 'burger', quantity: 2 },
        { menuItemId: 'tea', quantity: 3 },
        { menuItemId: 'free', quantity: 1 },
      ],
      menu,
    );
    expect(
      priced.lines.map((l) => [
        l.menuItemId,
        l.name,
        l.unitPrice.toFixed(2),
        l.lineTotal.toFixed(2),
      ]),
    ).toEqual([
      ['burger', 'Classic Burger', '185.50', '371.00'],
      ['tea', 'Mint Tea', '0.10', '0.30'],
      ['free', 'Water', '0.00', '0.00'],
    ]);
    expect(priced.total.toFixed(2)).toBe('371.30');
  });

  it('keeps repeated lines as sent', () => {
    const priced = priceOrder(
      [
        { menuItemId: 'tea', quantity: 1 },
        { menuItemId: 'tea', quantity: 2 },
      ],
      menu,
    );
    expect(priced.lines).toHaveLength(2);
    expect(priced.total.toFixed(2)).toBe('0.30');
  });

  it('throws on an item it was not given (the service checks availability first)', () => {
    expect(() => priceOrder([{ menuItemId: 'nope', quantity: 1 }], menu)).toThrow('nope');
  });
});
