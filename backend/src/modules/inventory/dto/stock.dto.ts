import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsString, MaxLength } from 'class-validator';
import { COST, IsDecimalString, QUANTITY } from '../../../common/decimal/decimal';
import { IsOptionalNotNull, Trim } from '../../../common/validation/optional';
import { STOCK_STATUSES, type StockStatus } from '../stock-math';

const UNITS = ['G', 'KG', 'ML', 'L', 'PCS'] as const;
type UnitValue = (typeof UNITS)[number];
const TYPES = ['RAW', 'READY', 'MIXED'] as const;
type TypeValue = (typeof TYPES)[number];

export class ListStockQueryDto {
  @ApiPropertyOptional({ enum: STOCK_STATUSES })
  @IsOptionalNotNull()
  @IsIn(STOCK_STATUSES)
  status?: StockStatus;

  @ApiPropertyOptional({ enum: TYPES })
  @IsOptionalNotNull()
  @IsIn(TYPES)
  type?: TypeValue;
}

export class RestockDto {
  @ApiProperty({
    type: String,
    pattern: QUANTITY.pattern,
    example: '500',
    description: 'Positive, in `unit` (defaults to the stock unit).',
  })
  @IsDecimalString(QUANTITY, { positive: true })
  quantity!: string;

  @ApiPropertyOptional({ enum: UNITS, description: "Same dimension as the item's stock unit." })
  @IsOptionalNotNull()
  @IsEnum(UNITS)
  unit?: UnitValue;

  @ApiPropertyOptional({
    type: String,
    pattern: COST.pattern,
    example: '0.42',
    description:
      'Cost per entered unit (converted to the stock unit). Optional: without it the moving average is unchanged.',
  })
  @IsOptionalNotNull()
  @IsDecimalString(COST)
  unitCost?: string;

  @ApiPropertyOptional({ maxLength: 500, description: 'Supplier, invoice, anything useful.' })
  @IsOptionalNotNull()
  @Trim()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class StockComponentDto {
  @ApiProperty({ format: 'uuid' })
  inventoryItemId!: string;

  @ApiProperty({ example: 'Tomatoes' })
  name!: string;

  @ApiProperty({
    type: String,
    pattern: QUANTITY.pattern,
    description: 'Per one unit of the MIXED item.',
  })
  quantityPerUnit!: string;

  @ApiProperty({ enum: UNITS })
  unit!: UnitValue;
}

export class StockItemDto {
  @ApiProperty({ format: 'uuid' })
  inventoryItemId!: string;

  @ApiProperty({ example: 'Mozzarella' })
  name!: string;

  @ApiProperty({ enum: TYPES })
  type!: TypeValue;

  @ApiProperty({ enum: UNITS, description: 'The stock unit.' })
  unit!: UnitValue;

  @ApiProperty({ enum: STOCK_STATUSES })
  status!: StockStatus;

  @ApiProperty({ type: String, nullable: true, description: 'Null for MIXED items (derived).' })
  currentStock!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Latest count + ledger since (ARCHITECTURE §5). Equals currentStock (the ledger keeps them in step); a write landing between the reads of one response can show them apart. Null for MIXED.',
  })
  expectedStock!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lowStockThreshold!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Moving average per stock unit.' })
  avgUnitCost!: string | null;

  @ApiProperty({ type: String, nullable: true })
  standardUnitCost!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastCountedAt!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'MIXED only: how many units its components allow (ADR 0002).',
  })
  derivedStock!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'MIXED only.' })
  limitingItemId!: string | null;

  @ApiProperty({
    type: [StockComponentDto],
    description: 'MIXED only, sorted by component name; empty otherwise.',
  })
  components!: StockComponentDto[];
}

export class StockItemDetailDto extends StockItemDto {
  @ApiProperty({ type: String, nullable: true, description: 'Quantity at the latest count.' })
  lastCountQuantity!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Sum of ledger rows since the latest count (or since the start).',
  })
  changeSinceLastCount!: string | null;
}

export class RestockResultDto {
  @ApiProperty({ format: 'uuid', description: 'The PURCHASE ledger row.' })
  transactionId!: string;

  @ApiProperty({ format: 'uuid' })
  inventoryItemId!: string;

  @ApiProperty({ type: String, description: 'In the stock unit.' })
  quantityDelta!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Stored on the row, per stock unit.' })
  unitCost!: string | null;

  @ApiProperty({ type: String })
  stockAfter!: string;

  @ApiProperty({ type: String, nullable: true })
  avgUnitCost!: string | null;
}
