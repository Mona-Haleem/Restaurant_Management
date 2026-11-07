import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { MONEY, QUANTITY } from '../../../common/decimal/decimal';

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const DATE_MESSAGE = 'must be a date as YYYY-MM-DD';
const UNITS = ['G', 'KG', 'ML', 'L', 'PCS'] as const;
type UnitValue = (typeof UNITS)[number];

export class KpisQueryDto {
  @ApiPropertyOptional({
    example: '2026-11-06',
    description: "A local day in the restaurant's timezone. Defaults to today.",
  })
  @IsOptional()
  @Matches(DATE, { message: `date ${DATE_MESSAGE}` })
  date?: string;
}

export class DateRangeQueryDto {
  @ApiProperty({ example: '2026-11-01', description: 'First local day, included.' })
  @Matches(DATE, { message: `from ${DATE_MESSAGE}` })
  from!: string;

  @ApiProperty({
    example: '2026-11-07',
    description: 'Last local day, included. At most 366 days after `from`.',
  })
  @Matches(DATE, { message: `to ${DATE_MESSAGE}` })
  to!: string;
}

/** Shared by the dashboard cards and each day of the range report. */
export class DayFiguresDto {
  @ApiProperty({ example: '2026-11-06', description: "The local day (restaurant's timezone)." })
  date!: string;

  @ApiProperty({
    type: String,
    pattern: MONEY.pattern,
    example: '1240.00',
    description:
      'Totals of the orders that reached a `deductsInventory` stage that day, not cancelled.',
  })
  revenue!: string;

  @ApiProperty({ example: 12, description: 'Orders placed that day, not cancelled.' })
  orderCount!: number;

  @ApiProperty({
    type: String,
    pattern: MONEY.pattern,
    example: '36.40',
    description:
      'Σ wasted quantity × the unit cost stored on each WASTE row (ADR 0005), rounded half-up.',
  })
  wasteCost!: string;

  @ApiProperty({
    example: 0,
    description:
      'WASTE rows that day with no cost (no average and no standard cost); not in wasteCost.',
  })
  uncostedWasteRows!: number;
}

export class KpisDto extends DayFiguresDto {
  @ApiProperty({ example: 'Africa/Cairo' })
  timezone!: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'The branch reported on; null = every branch (an ADMIN with no branch chosen).',
  })
  branchId!: string | null;

  @ApiProperty({
    example: 2,
    description:
      'Active RAW/READY items now negative, at zero or below their threshold (the B702 rule). ' +
      'Current state, the same for any date.',
  })
  lowStockCount!: number;
}

export class DailyReportDto {
  @ApiProperty({ example: '2026-11-01' })
  from!: string;

  @ApiProperty({ example: '2026-11-07' })
  to!: string;

  @ApiProperty({ example: 'Africa/Cairo' })
  timezone!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  branchId!: string | null;

  @ApiProperty({ type: [DayFiguresDto], description: 'One row per local day, in date order.' })
  days!: DayFiguresDto[];

  @ApiProperty({ type: DayFiguresDto, description: 'Sums over the range; `date` is `from`.' })
  totals!: DayFiguresDto;
}

export class DeductionAnomalyDto {
  @ApiProperty({ format: 'uuid' })
  orderId!: string;

  @ApiProperty({ format: 'date-time', description: 'When it reached the deducting stage.' })
  deliveredAt!: string;

  @ApiProperty({ format: 'uuid' })
  inventoryItemId!: string;

  @ApiProperty({ example: 'Mozzarella' })
  itemName!: string;

  @ApiProperty({ enum: ['OVER_DEDUCTED', 'UNDER_DEDUCTED', 'NOT_IN_RECIPE', 'NOT_DEDUCTED'] })
  kind!: string;

  @ApiProperty({ type: String, pattern: QUANTITY.pattern, example: '0.150' })
  expectedQuantity!: string;

  @ApiProperty({ type: String, pattern: QUANTITY.pattern, example: '0.450' })
  actualQuantity!: string;

  @ApiProperty({ enum: UNITS, description: "The item's stock unit." })
  unit!: UnitValue;

  @ApiProperty({
    example: 'Mozzarella: deducted 3× the recipe expectation (0.450 KG instead of 0.150 KG).',
  })
  reason!: string;
}

export class UncheckedOrderDto {
  @ApiProperty({ format: 'uuid' })
  orderId!: string;

  @ApiProperty({ format: 'date-time' })
  deliveredAt!: string;

  @ApiProperty({
    example: 'A menu item, recipe or inventory item changed after delivery, so it was not checked.',
  })
  reason!: string;
}

export class AnomaliesDto {
  @ApiProperty({ example: '2026-11-01' })
  from!: string;

  @ApiProperty({ example: '2026-11-07' })
  to!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  branchId!: string | null;

  @ApiProperty({ example: 14, description: 'Delivered orders compared with their recipes.' })
  checkedOrders!: number;

  @ApiProperty({ type: [DeductionAnomalyDto], description: 'Newest delivery first.' })
  anomalies!: DeductionAnomalyDto[];

  @ApiProperty({
    type: [UncheckedOrderDto],
    description: 'Delivered orders that could not be compared (no recipe history, ADR 0026).',
  })
  unchecked!: UncheckedOrderDto[];
}
