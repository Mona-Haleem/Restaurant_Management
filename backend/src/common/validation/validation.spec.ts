import { Type } from 'class-transformer';
import { IsInt, IsString, Min, ValidateNested } from 'class-validator';
import { AppException } from '../errors/app-exception';
import { createValidationPipe, validationExceptionFactory } from './validation';

class LineDto {
  @IsInt()
  @Min(1)
  qty!: number;
}

class OrderDto {
  @IsString()
  name!: string;

  @ValidateNested({ each: true })
  @Type(() => LineDto)
  lines!: LineDto[];
}

async function validate(body: unknown): Promise<unknown> {
  return createValidationPipe().transform(body, { type: 'body', metatype: OrderDto });
}

async function failure(body: unknown): Promise<AppException> {
  try {
    await validate(body);
  } catch (error) {
    if (error instanceof AppException) return error;
    throw error;
  }
  throw new Error('expected validation to fail');
}

describe('global validation pipe', () => {
  it('passes a valid body and transforms it into the DTO', async () => {
    const result = await validate({ name: 'Pizza', lines: [{ qty: 2 }] });
    expect(result).toBeInstanceOf(OrderDto);
  });

  it('rejects with VALIDATION_FAILED and one entry per field', async () => {
    const error = await failure({ name: 5, lines: [{ qty: 0 }] });
    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed',
      details: {
        fields: [
          { field: 'name', messages: ['name must be a string'] },
          { field: 'lines.0.qty', messages: ['qty must not be less than 1'] },
        ],
      },
    });
  });

  it('rejects unknown properties instead of silently dropping them', async () => {
    const error = await failure({ name: 'Pizza', lines: [], tenantId: 'someone-else' });
    expect(error.getResponse()).toMatchObject({
      details: {
        fields: [{ field: 'tenantId', messages: ['property tenantId should not exist'] }],
      },
    });
  });

  it('handles an error with no constraints and no children', () => {
    const exception = validationExceptionFactory([{ property: 'x', children: [] }]);
    expect(exception.getResponse()).toMatchObject({
      details: { fields: [{ field: 'x', messages: ['x is invalid'] }] },
    });
  });
});
