import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, IsUUID, Length } from 'class-validator';
import { IsDecimalString, QUANTITY } from '../../../common/decimal/decimal';
import { Trim } from '../../../common/validation/optional';

const UNITS = ['G', 'KG', 'ML', 'L', 'PCS'] as const;
type UnitValue = (typeof UNITS)[number];
/** Stock after a change may be below zero (ADR 0006). */
const SIGNED_QUANTITY_PATTERN = `^-?${QUANTITY.pattern.slice(1)}`;

/** The Waste Form (PRD): item, quantity, reason. Branch and actor come from the context. */
export class LogWasteDto {
  @ApiProperty({
    format: 'uuid',
    description: 'An active RAW or READY item of this restaurant (MIXED items have no stock).',
  })
  @IsUUID()
  inventoryItemId!: string;

  @ApiProperty({
    type: String,
    pattern: QUANTITY.pattern,
    example: '250',
    description: 'As entered, in `unit`. Positive; at most 3 decimals in the stock unit.',
  })
  @IsDecimalString(QUANTITY, { positive: true })
  quantity!: string;

  @ApiProperty({ enum: UNITS, description: "Same dimension as the item's stock unit (ADR 0003)." })
  @IsEnum(UNITS)
  unit!: UnitValue;

  @ApiProperty({
    example: 'Failed prep',
    minLength: 1,
    maxLength: 200,
    description: 'Free text, trimmed. The app offers preset reasons as chips.',
  })
  @Trim()
  @IsString()
  @Length(1, 200)
  reason!: string;
}

export class WasteEntryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  branchId!: string;

  @ApiProperty({ format: 'uuid' })
  inventoryItemId!: string;

  @ApiProperty({
    type: String,
    pattern: QUANTITY.pattern,
    example: '250.000',
    description: 'As entered.',
  })
  quantity!: string;

  @ApiProperty({ enum: UNITS, description: 'As entered.' })
  unit!: UnitValue;

  @ApiProperty({ example: 'Failed prep' })
  reason!: string;

  @ApiProperty({ format: 'uuid', description: 'Its WASTE row in the inventory ledger.' })
  transactionId!: string;

  @ApiProperty({ format: 'uuid', description: 'Who logged it.' })
  actorId!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({
    type: String,
    pattern: SIGNED_QUANTITY_PATTERN,
    example: '-0.250',
    description: "The stock change, negative, in the item's stock unit.",
  })
  quantityDelta!: string;

  @ApiProperty({
    type: String,
    pattern: SIGNED_QUANTITY_PATTERN,
    example: '1.750',
    description: "The branch's stock right after, in the stock unit. May be negative.",
  })
  stockAfter!: string;

  @ApiProperty({
    description: 'True when stock is now below zero (allowed and flagged, ADR 0006).',
  })
  negative!: boolean;
}
