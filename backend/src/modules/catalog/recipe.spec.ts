import { validateRecipe, type RecipeIssue } from './recipe';

// B601: ingredient rows must reference real (active, same-tenant) inventory items with positive
// quantities in a unit of the item's dimension, fitting numeric(14,3) after conversion (ADR 0013).

const BEEF = { id: 'beef', unit: 'KG' as const, isActive: true };
const BUNS = { id: 'buns', unit: 'PCS' as const, isActive: true };
const OLD = { id: 'old', unit: 'KG' as const, isActive: false };
const items = new Map([BEEF, BUNS, OLD].map((i) => [i.id, i]));

const issues = (
  lines: { inventoryItemId: string; quantity: string; unit: 'G' | 'KG' | 'ML' | 'L' | 'PCS' }[],
): RecipeIssue[] => validateRecipe(lines, items);

describe('validateRecipe', () => {
  it('accepts a valid recipe, including an empty one', () => {
    expect(
      issues([
        { inventoryItemId: 'beef', quantity: '150', unit: 'G' },
        { inventoryItemId: 'buns', quantity: '1', unit: 'PCS' },
      ]),
    ).toEqual([]);
    expect(issues([])).toEqual([]);
  });

  it('refuses an unknown or archived inventory item', () => {
    expect(issues([{ inventoryItemId: 'nope', quantity: '1', unit: 'KG' }])).toEqual([
      { index: 0, code: 'INVENTORY_ITEM_NOT_FOUND', inventoryItemId: 'nope' },
    ]);
    expect(issues([{ inventoryItemId: 'old', quantity: '1', unit: 'KG' }])).toEqual([
      { index: 0, code: 'INVENTORY_ITEM_NOT_FOUND', inventoryItemId: 'old' },
    ]);
  });

  it('refuses the same inventory item twice', () => {
    expect(
      issues([
        { inventoryItemId: 'beef', quantity: '100', unit: 'G' },
        { inventoryItemId: 'beef', quantity: '0.05', unit: 'KG' },
      ]),
    ).toEqual([{ index: 1, code: 'DUPLICATE_INGREDIENT', inventoryItemId: 'beef' }]);
  });

  it('refuses a unit from another dimension', () => {
    expect(issues([{ inventoryItemId: 'buns', quantity: '20', unit: 'G' }])).toEqual([
      { index: 0, code: 'UNIT_DIMENSION_MISMATCH', inventoryItemId: 'buns' },
    ]);
  });

  it('refuses a quantity that needs more than 3 decimals in the stock unit', () => {
    // 0.5 G of a KG item is 0.0005 KG: numeric(14,3) would round it to 0.001 (ADR 0013).
    expect(issues([{ inventoryItemId: 'beef', quantity: '0.5', unit: 'G' }])).toEqual([
      { index: 0, code: 'INGREDIENT_QUANTITY_TOO_PRECISE', inventoryItemId: 'beef' },
    ]);
  });

  it.each(['0', '-1'])('refuses a non-positive quantity %s', (quantity) => {
    expect(issues([{ inventoryItemId: 'beef', quantity, unit: 'KG' }])).toEqual([
      { index: 0, code: 'INGREDIENT_QUANTITY_NOT_POSITIVE', inventoryItemId: 'beef' },
    ]);
  });

  it('refuses a quantity that grows past numeric(14,3) once converted', () => {
    const grams = new Map([['salt', { id: 'salt', unit: 'G' as const, isActive: true }]]);
    expect(
      validateRecipe([{ inventoryItemId: 'salt', quantity: '99999999999', unit: 'KG' }], grams),
    ).toEqual([{ index: 0, code: 'INGREDIENT_QUANTITY_TOO_LARGE', inventoryItemId: 'salt' }]);
    expect(
      validateRecipe([{ inventoryItemId: 'salt', quantity: '99999999', unit: 'KG' }], grams),
    ).toEqual([]);
  });

  it('reports every bad row, in order', () => {
    expect(
      issues([
        { inventoryItemId: 'nope', quantity: '1', unit: 'KG' },
        { inventoryItemId: 'beef', quantity: '1', unit: 'KG' },
        { inventoryItemId: 'buns', quantity: '1', unit: 'L' },
      ]).map((i) => [i.index, i.code]),
    ).toEqual([
      [0, 'INVENTORY_ITEM_NOT_FOUND'],
      [2, 'UNIT_DIMENSION_MISMATCH'],
    ]);
  });
});
