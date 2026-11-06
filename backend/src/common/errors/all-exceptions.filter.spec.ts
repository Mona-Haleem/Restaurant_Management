import type { ArgumentsHost } from '@nestjs/common';
import { HttpStatus, NotFoundException } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import type { PinoLogger } from 'nestjs-pino';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppException } from './app-exception';

function setup(): {
  filter: AllExceptionsFilter;
  host: ArgumentsHost;
  reply: jest.Mock;
  logger: { error: jest.Mock; warn: jest.Mock };
} {
  const reply = jest.fn();
  const adapterHost = { httpAdapter: { reply } } as unknown as HttpAdapterHost;
  const logger = { error: jest.fn(), warn: jest.fn() };
  const filter = new AllExceptionsFilter(adapterHost, logger as unknown as PinoLogger);
  const response = {};
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { filter, host, reply, logger };
}

describe('AllExceptionsFilter', () => {
  it('replies with the error shape and status', () => {
    const { filter, host, reply } = setup();
    filter.catch(new AppException(HttpStatus.CONFLICT, 'ORDER_NOT_CANCELLABLE', 'No'), host);
    expect(reply).toHaveBeenCalledWith(
      {},
      { code: 'ORDER_NOT_CANCELLABLE', message: 'No', details: {} },
      409,
    );
  });

  it('logs a 5xx with the original error (stack stays in the logs, not the response)', () => {
    const { filter, host, reply, logger } = setup();
    const error = new Error('boom');
    filter.catch(error, host);
    expect(logger.error).toHaveBeenCalledWith({ err: error }, 'Unhandled error');
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        details: {},
      },
      500,
    );
  });

  it('does not log expected 4xx errors as errors', () => {
    const { filter, host, logger } = setup();
    filter.catch(new NotFoundException(), host);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
