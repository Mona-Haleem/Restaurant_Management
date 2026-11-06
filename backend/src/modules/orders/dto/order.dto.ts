import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MONEY } from '../../../common/decimal/decimal';
import { IsOptionalNotNull, Trim } from '../../../common/validation/optional';

const PLACED_BY = ['STAFF', 'CUSTOMER', 'GUEST'] as const;
const STAGE_KEY_DESCRIPTION =
  "A key of the restaurant's workflow (tenant data, not an enum). Defaults: `pending`, " +
  '`in-preparation`, `ready`, `delivered` (ADR 0009).';

// ── Workflow ─────────────────────────────────────────────────────────────────────────────
export class WorkflowStageDto {
  @ApiProperty({ example: 'pending', description: STAGE_KEY_DESCRIPTION })
  key!: string;

  @ApiProperty({ example: 'Pending' })
  label!: string;

  @ApiProperty({ example: 1, description: 'Orders move to the next higher position.' })
  position!: number;

  @ApiProperty({ description: 'An order on this stage may be cancelled.' })
  cancellable!: boolean;

  @ApiProperty({ description: 'Reaching this stage deducts the order from inventory (once).' })
  deductsInventory!: boolean;
}

export class WorkflowDto {
  @ApiProperty({ type: [WorkflowStageDto], description: 'Sorted by position.' })
  stages!: WorkflowStageDto[];
}

// ── Placing an order ─────────────────────────────────────────────────────────────────────
export class OrderLineInputDto {
  @ApiProperty({
    format: 'uuid',
    description: 'An active menu item sold in this branch (see the customer menu).',
  })
  @IsUUID()
  menuItemId!: string;

  @ApiProperty({ minimum: 1, maximum: 99, example: 2, description: 'How many, a whole number.' })
  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;
}

export class PlaceOrderDto {
  @ApiProperty({
    type: [OrderLineInputDto],
    minItems: 1,
    maxItems: 50,
    description: 'Name and price are copied from the menu; the client never sends prices.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderLineInputDto)
  items!: OrderLineInputDto[];

  @ApiPropertyOptional({
    maxLength: 500,
    example: 'No onions, please',
    description: 'Special instructions. Trimmed; empty = none.',
  })
  @IsOptionalNotNull()
  @Trim()
  @IsString()
  @MaxLength(500)
  note?: string;
}

// ── Responses ────────────────────────────────────────────────────────────────────────────
export class PlacedByDto {
  @ApiProperty({ enum: PLACED_BY, description: 'Phase 1: GUEST, or STAFF for a staff caller.' })
  actorType!: (typeof PLACED_BY)[number];

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'null for a guest.' })
  actorId!: string | null;
}

export class OrderItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  menuItemId!: string;

  @ApiProperty({ description: 'Copied when the order was placed.' })
  name!: string;

  @ApiProperty({ type: String, pattern: MONEY.pattern, example: '185.00' })
  unitPrice!: string;

  @ApiProperty({ example: 2 })
  quantity!: number;

  @ApiProperty({ type: String, pattern: MONEY.pattern, example: '370.00' })
  lineTotal!: string;
}

export class OrderDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  branchId!: string;

  @ApiProperty({ example: 'pending', description: STAGE_KEY_DESCRIPTION })
  stageKey!: string;

  @ApiProperty({
    example: 'pending',
    description: '`cancelled` when `canceledAt` is set, else `stageKey` (ADR 0009). Display only.',
  })
  status!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  canceledAt!: string | null;

  @ApiProperty({ type: PlacedByDto })
  placedBy!: PlacedByDto;

  @ApiProperty({ type: String, pattern: MONEY.pattern, example: '370.00' })
  total!: string;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty({ type: [OrderItemDto] })
  items!: OrderItemDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class PlacedOrderDto extends OrderDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'q3Jb2wQ0bS6m0eU4f1yZ1c3mX9a7hK2pV5tR8nL4dWs',
    description:
      'Guest orders only: the secret for tracking and cancelling (ADR 0008). Returned once, ' +
      'never stored in plain form; keep it. null for staff orders.',
  })
  trackingToken!: string | null;
}
