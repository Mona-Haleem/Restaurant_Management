import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { IsDecimalString, MONEY, QUANTITY } from '../../../common/decimal/decimal';
import { IsOptionalNotNull, Trim } from '../../../common/validation/optional';

const UNITS = ['G', 'KG', 'ML', 'L', 'PCS'] as const;
type UnitValue = (typeof UNITS)[number];
const STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
type StatusValue = (typeof STATUSES)[number];

export class IngredientInputDto {
  @ApiProperty({ format: 'uuid', description: 'An active inventory item of this restaurant.' })
  @IsUUID()
  inventoryItemId!: string;

  @ApiProperty({
    type: String,
    pattern: QUANTITY.pattern,
    example: '150',
    description: 'Per one menu item, in `unit`. Positive; at most 3 decimals after conversion.',
  })
  @IsDecimalString(QUANTITY, { positive: true })
  quantity!: string;

  @ApiProperty({ enum: UNITS, description: "Same dimension as the item's stock unit (ADR 0003)." })
  @IsEnum(UNITS)
  unit!: UnitValue;
}

export class CreateMenuItemDto {
  @ApiProperty({ format: 'uuid', description: 'An active category of this restaurant.' })
  @IsUUID()
  categoryId!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Only this branch sells it; null or absent = every branch.',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string | null;

  @ApiProperty({
    example: 'Classic Beef Burger',
    minLength: 1,
    maxLength: 120,
    description: 'Trimmed.',
  })
  @Trim()
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiProperty({
    type: String,
    pattern: MONEY.pattern,
    example: '185.00',
    description: '0 or more.',
  })
  @IsDecimalString(MONEY)
  price!: string;

  @ApiPropertyOptional({ type: [IngredientInputDto], description: 'The recipe. Defaults to none.' })
  @IsOptionalNotNull()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => IngredientInputDto)
  ingredients?: IngredientInputDto[];
}

/**
 * Every field is optional. `null` is allowed only where it means something: `branchId` (sell in
 * every branch) and `description` (clear it). Elsewhere `null` is a 400, never a 500.
 */
export class UpdateMenuItemDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptionalNotNull()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'null = every branch; absent = unchanged.',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string | null;

  @ApiPropertyOptional({ minLength: 1, maxLength: 120, description: 'Trimmed.' })
  @IsOptionalNotNull()
  @Trim()
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 500,
    description: 'null clears it; absent = unchanged.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({ type: String, pattern: MONEY.pattern, example: '185.00' })
  @IsOptionalNotNull()
  @IsDecimalString(MONEY)
  price?: string;

  @ApiPropertyOptional({
    type: [IngredientInputDto],
    description: 'Replaces the whole recipe. Leave it out to keep the current one.',
  })
  @IsOptionalNotNull()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => IngredientInputDto)
  ingredients?: IngredientInputDto[];
}

export class ListMenuItemsQueryDto {
  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: StatusValue;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Part of the name, any case.', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class CustomerMenuQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Part of the name, any case.', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class IngredientDto {
  @ApiProperty({ format: 'uuid' })
  inventoryItemId!: string;

  @ApiProperty({ example: 'Beef Mince' })
  inventoryItemName!: string;

  @ApiProperty({ type: String, pattern: QUANTITY.pattern, example: '150.000' })
  quantity!: string;

  @ApiProperty({ enum: UNITS })
  unit!: UnitValue;
}

export class MenuItemSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  categoryId!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  branchId!: string | null;

  @ApiProperty({ example: 'Classic Beef Burger' })
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ type: String, pattern: MONEY.pattern, example: '185.00' })
  price!: string;

  @ApiProperty({ enum: STATUSES })
  status!: StatusValue;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class MenuItemDto extends MenuItemSummaryDto {
  @ApiProperty({ type: [IngredientDto], description: 'Sorted by inventory item name.' })
  ingredients!: IngredientDto[];
}

export class CustomerCategoryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Burgers' })
  name!: string;

  @ApiProperty({ example: 1 })
  position!: number;
}

export class CustomerMenuItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  categoryId!: string;

  @ApiProperty({ example: 'Classic Beef Burger' })
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ type: String, pattern: MONEY.pattern, example: '185.00' })
  price!: string;
}

export class CustomerMenuDto {
  @ApiProperty({
    type: [CustomerCategoryDto],
    description: 'Active categories with at least one visible item, in display order.',
  })
  categories!: CustomerCategoryDto[];

  @ApiProperty({ type: [CustomerMenuItemDto] })
  items!: CustomerMenuItemDto[];
}
