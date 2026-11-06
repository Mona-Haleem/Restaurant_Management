import type { Unit } from '../../generated/prisma/enums';
import { parseDecimal, QUANTITY } from '../../common/decimal/decimal';
import { convertQuantity, sameDimension } from '../../common/units/units';

export interface RecipeLine {
  inventoryItemId: string;
  quantity: string;
  unit: Unit;
}

export interface RecipeItem {
  id: string;
  unit: Unit;
  isActive: boolean;
}

export type RecipeIssueCode =
  | 'INVENTORY_ITEM_NOT_FOUND'
  | 'DUPLICATE_INGREDIENT'
  | 'UNIT_DIMENSION_MISMATCH'
  | 'INGREDIENT_QUANTITY_NOT_POSITIVE'
  | 'INGREDIENT_QUANTITY_TOO_PRECISE'
  | 'INGREDIENT_QUANTITY_TOO_LARGE';

export interface RecipeIssue {
  index: number;
  code: RecipeIssueCode;
  inventoryItemId: string;
}

/**
 * B601 recipe rules, as a pure function. `items` holds the tenant's inventory items the lines
 * name (looked up through the tenant-scoped client, so another tenant's id is simply absent).
 * Returns one issue per bad line, in order; an empty list means the recipe is valid.
 */
export function validateRecipe(
  lines: readonly RecipeLine[],
  items: ReadonlyMap<string, RecipeItem>,
): RecipeIssue[] {
  const issues: RecipeIssue[] = [];
  const seen = new Set<string>();
  lines.forEach((line, index) => {
    const issue = (code: RecipeIssueCode): void => {
      issues.push({ index, code, inventoryItemId: line.inventoryItemId });
    };
    const item = items.get(line.inventoryItemId);
    if (!item || !item.isActive) return issue('INVENTORY_ITEM_NOT_FOUND');
    if (seen.has(item.id)) return issue('DUPLICATE_INGREDIENT');
    seen.add(item.id);
    if (!sameDimension(line.unit, item.unit)) return issue('UNIT_DIMENSION_MISMATCH');
    const quantity = parseDecimal(line.quantity);
    if (!quantity.isPositive() || quantity.isZero())
      return issue('INGREDIENT_QUANTITY_NOT_POSITIVE');
    // ADR 0013: the converted quantity must fit numeric(14,3), or the ledger would round it
    // (too many decimals) or overflow (too many integer digits).
    const inStockUnit = convertQuantity(quantity, line.unit, item.unit);
    if (inStockUnit.decimalPlaces() > QUANTITY.scale)
      return issue('INGREDIENT_QUANTITY_TOO_PRECISE');
    if (inStockUnit.truncated().toFixed(0).length > QUANTITY.integerDigits) {
      issue('INGREDIENT_QUANTITY_TOO_LARGE');
    }
  });
  return issues;
}
