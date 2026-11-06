import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import type { ErrorBody } from './error-body';

/** OpenAPI description of the one error shape (ARCHITECTURE §7). Documentation only. */
@ApiSchema({ name: 'ErrorResponse' })
export class ErrorResponseDto implements ErrorBody {
  @ApiProperty({
    description: 'Stable machine-readable code the frontend switches on.',
    example: 'VALIDATION_FAILED',
  })
  code!: string;

  @ApiProperty({
    description: 'Human-readable summary. Do not parse it.',
    example: 'Request validation failed',
  })
  message!: string;

  @ApiProperty({
    description:
      'Machine-readable context. VALIDATION_FAILED: `{ fields: [{ field, messages }] }`.',
    type: 'object',
    additionalProperties: true,
    example: { fields: [{ field: 'name', messages: ['name must be a string'] }] },
  })
  details!: Record<string, unknown>;
}
