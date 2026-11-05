import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { toErrorResponse } from './error-body';

/** Global filter: every error leaves the API as `{ code, message, details }`, never a stack. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    @InjectPinoLogger(AllExceptionsFilter.name) private readonly logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { status, body } = toErrorResponse(exception);
    if (status >= 500) {
      // The full error (message + stack) is logged with the request id, never sent to the client.
      this.logger.error({ err: exception }, 'Unhandled error');
    }
    this.adapterHost.httpAdapter.reply(host.switchToHttp().getResponse(), body, status);
  }
}
