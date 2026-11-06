import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';
import { IsOptionalNotNull, Trim } from '../../../common/validation/optional';

const ROLES = ['ADMIN', 'MANAGER', 'WORKER'] as const;
type RoleValue = (typeof ROLES)[number];
const STATUSES = ['ACTIVE', 'INACTIVE'] as const;
type StatusValue = (typeof STATUSES)[number];

/** Trims and lowercases an email, so `Omar@X.example ` and `omar@x.example` are one address. */
function NormalizeEmail(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
}

/** A staff member. The password hash never leaves the API. */
export class StaffMemberDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Omar Hassan' })
  name!: string;

  @ApiProperty({ type: String, nullable: true, example: 'omar@nile-bites.example' })
  email!: string | null;

  @ApiProperty({ enum: ROLES })
  role!: RoleValue;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Null for an ADMIN (works across branches).',
  })
  branchId!: string | null;

  @ApiProperty({
    description:
      'False = deactivated: hidden from active selections, kept (with its name) for history.',
  })
  isActive!: boolean;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class ListStaffQueryDto {
  @ApiPropertyOptional({ enum: STATUSES, description: 'Absent = active and inactive staff.' })
  @IsOptional()
  @IsIn(STATUSES)
  status?: StatusValue;

  @ApiPropertyOptional({ enum: ROLES })
  @IsOptional()
  @IsIn(ROLES)
  role?: RoleValue;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class CreateStaffMemberDto {
  @ApiProperty({ example: 'Mariam Khaled', minLength: 1, maxLength: 120, description: 'Trimmed.' })
  @Trim()
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 254,
    example: 'mariam@nile-bites.example',
    description: 'Unique per restaurant, any case (stored lowercase).',
  })
  @IsOptional()
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @ApiProperty({
    minLength: 8,
    maxLength: 128,
    format: 'password',
    description: 'Stored as an argon2id hash. No login endpoint until Phase 2.',
  })
  @IsString()
  @Length(8, 128)
  password!: string;

  @ApiProperty({ enum: ROLES, description: 'A MANAGER may only create WORKERs.' })
  @IsIn(ROLES)
  role!: RoleValue;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      "Required for MANAGER/WORKER (defaults to the caller's branch); must be absent or null for ADMIN.",
  })
  @IsOptional()
  @IsUUID()
  branchId?: string | null;
}

/** Every field is optional; `null` is accepted only for `email` (cleared) and `branchId`. */
export class UpdateStaffMemberDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 120, description: 'Trimmed.' })
  @IsOptionalNotNull()
  @Trim()
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 254 })
  @IsOptional()
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @ApiPropertyOptional({
    enum: ROLES,
    description: 'Assign a role. Becoming ADMIN drops the branch.',
  })
  @IsOptionalNotNull()
  @IsIn(ROLES)
  role?: RoleValue;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  branchId?: string | null;

  @ApiPropertyOptional({ description: 'False deactivates (never deletes), true reactivates.' })
  @IsOptionalNotNull()
  @IsBoolean()
  isActive?: boolean;
}
