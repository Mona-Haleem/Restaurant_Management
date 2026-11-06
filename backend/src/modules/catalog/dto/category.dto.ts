import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsString, Length, Max, Min } from 'class-validator';
import { IsOptionalNotNull, Trim } from '../../../common/validation/optional';

export class CategoryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Burgers' })
  name!: string;

  @ApiProperty({ description: 'Display order, lowest first.', example: 1 })
  position!: number;

  @ApiProperty({ description: 'False = archived: its items are hidden from the customer menu.' })
  isActive!: boolean;
}

export class CreateCategoryDto {
  @ApiProperty({ example: 'Desserts', minLength: 1, maxLength: 80, description: 'Trimmed.' })
  @Trim()
  @IsString()
  @Length(1, 80)
  name!: string;

  @ApiPropertyOptional({ description: 'Defaults to after the last category.', minimum: 0 })
  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  @Max(10_000)
  position?: number;
}

/** Every field is optional, but none may be null (the columns are NOT NULL). */
export class UpdateCategoryDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 80, description: 'Trimmed.' })
  @IsOptionalNotNull()
  @Trim()
  @IsString()
  @Length(1, 80)
  name?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  @Max(10_000)
  position?: number;

  @ApiPropertyOptional({ description: 'False archives the category, true brings it back.' })
  @IsOptionalNotNull()
  @IsBoolean()
  isActive?: boolean;
}
