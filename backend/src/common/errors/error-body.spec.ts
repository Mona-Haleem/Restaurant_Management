import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AppException } from './app-exception';
import { toErrorResponse } from './error-body';

describe('toErrorResponse', () => {
  it('passes an AppException through unchanged', () => {
    const exception = new AppException(HttpStatus.CONFLICT, 'ORDER_NOT_CANCELLABLE', 'Too late', {
      orderId: 'o1',
    });
    expect(toErrorResponse(exception)).toEqual({
      status: 409,
      body: { code: 'ORDER_NOT_CANCELLABLE', message: 'Too late', details: { orderId: 'o1' } },
    });
  });

  it('defaults AppException details to an empty object', () => {
    expect(toErrorResponse(new AppException(400, 'X', 'y')).body.details).toEqual({});
  });

  it.each([
    [new NotFoundException('Cannot GET /v1/nope'), 404, 'NOT_FOUND', 'Cannot GET /v1/nope'],
    [new ForbiddenException(), 403, 'FORBIDDEN', 'Forbidden'],
    [new BadRequestException(), 400, 'BAD_REQUEST', 'Bad Request'],
    [new PayloadTooLargeException(), 413, 'PAYLOAD_TOO_LARGE', 'Payload Too Large'],
    [new HttpException('I am a teapot', 418), 418, 'HTTP_418', 'I am a teapot'],
  ])('maps a Nest HttpException (%s)', (exception, status, code, message) => {
    expect(toErrorResponse(exception)).toEqual({ status, body: { code, message, details: {} } });
  });

  it('keeps the first message when Nest gives a list', () => {
    const exception = new BadRequestException({ message: ['a is bad', 'b is bad'] });
    expect(toErrorResponse(exception).body.message).toBe('a is bad');
  });

  it('hides the message of a Nest 5xx exception but keeps its status and code', () => {
    const exception = new ServiceUnavailableException('pool timeout on db.internal:5432');
    expect(toErrorResponse(exception)).toEqual({
      status: 503,
      body: { code: 'SERVICE_UNAVAILABLE', message: 'Internal server error', details: {} },
    });
  });

  it('turns an unknown error into a generic 500 with no internals', () => {
    const error = new Error('connection to postgres://admin:hunter2@db failed');
    const response = toErrorResponse(error);
    expect(response).toEqual({
      status: 500,
      body: { code: 'INTERNAL_ERROR', message: 'Internal server error', details: {} },
    });
    expect(JSON.stringify(response)).not.toContain('hunter2');
    expect(JSON.stringify(response)).not.toContain('at ');
  });

  it.each([null, undefined, 'a string', 42])('handles a thrown non-error (%p)', (thrown) => {
    expect(toErrorResponse(thrown).status).toBe(500);
  });
});
