import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { IsDecimalString, QUANTITY } from '../../../common/decimal/decimal';
import { IsOptionalNotNull, Trim } from '../../../common/validation/optional';

const UNITS = ['G', 'KG', 'ML', 'L', 'PCS'] as const;
type UnitValue = (typeof UNITS)[number];
/** Expected stock and gaps may be below zero (ADR 0006). */
const SIGNED_QUANTITY_PATTERN = `^-?${QUANTITY.pattern.slice(1)}`;

export class CountLineDto {
  @ApiProperty({ format: 'uuid', description: 'An active RAW or READY item of this restaurant.' })
  @IsUUID()
  inventoryItemId!: string;

  @ApiProperty({
    type: String,
    pattern: QUANTITY.pattern,
    example: '7.5',
    description:
      'What is physically there, in `unit`. Zero or more; at most 3 decimals in the stock unit.',
  })
  @IsDecimalString(QUANTITY)
  quantity!: string;

  @ApiProperty({ enum: UNITS, description: "Same dimension as the item's stock unit (ADR 0003)." })
  @IsEnum(UNITS)
  unit!: UnitValue;
}

/** The end-of-day count sheet (PRD reconciliation). Branch and actor come from the context. */
export class CreateReconciliationDto {
  @ApiProperty({
    type: [CountLineDto],
    minItems: 1,
    maxItems: 200,
    description: 'One line per item; an item may appear once. Applied together or not at all.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CountLineDto)
  counts!: CountLineDto[];

  @ApiPropertyOptional({ maxLength: 500, example: 'End of day', description: 'Trimmed.' })
  @IsOptionalNotNull()
  @Trim()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReconciliationEntryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  inventoryItemId!: string;

  @ApiProperty({
    type: String,
    pattern: QUANTITY.pattern,
    example: '7.500',
    description: 'The count, in the stock unit.',
  })
  countedQuantity!: string;

  @ApiProperty({
    type: String,
    pattern: SIGNED_QUANTITY_PATTERN,
    example: '8.000',
    description:
      'Latest count + every ledger row since (logged waste included), in the stock unit.',
  })
  expectedQuantity!: string;

  @ApiProperty({
    type: String,
    pattern: SIGNED_QUANTITY_PATTERN,
    example: '-0.500',
    description: 'counted − expected: the unexplained difference only. Negative = missing.',
  })
  gap!: string;

  @ApiProperty({ description: 'True when the gap is not zero.' })
  flagged!: boolean;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'The ADJUSTMENT ledger row for the gap; null when the gap is zero.',
  })
  adjustmentTransactionId!: string | null;

  @ApiProperty({
    format: 'uuid',
    description: 'The new snapshot: the next expected stock starts here.',
  })
  snapshotId!: string;

  @ApiProperty({
    type: String,
    pattern: SIGNED_QUANTITY_PATTERN,
    example: '7.500',
    description: 'The branch stock right after, in the stock unit (equals the count).',
  })
  stockAfter!: string;
}

export class ReconciliationDto {
  @ApiProperty({ format: 'uuid' })
  branchId!: string;

  @ApiProperty({ format: 'uuid', description: 'Who counted.' })
  actorId!: string;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: [ReconciliationEntryDto], description: 'In the order of the request.' })
  entries!: ReconciliationEntryDto[];
}
