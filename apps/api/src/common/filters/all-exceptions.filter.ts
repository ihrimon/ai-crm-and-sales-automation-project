import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';

// architecture/README.md §7 — a single global exception filter mapping every
// error to the Error shape in docs/api/openapi.yaml's components.schemas.Error
// ({ error: { code, message, requestId } }). Nothing past this filter ever
// hands a client a raw stack trace or provider error (FR-041, NFR-015/016).
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const requestId = randomUUID();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = 'An unexpected error occurred.';
    let code: string | undefined;

    if (isHttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        const rawMessage = b.message;
        message = Array.isArray(rawMessage) ? rawMessage.join('; ') : String(rawMessage ?? exception.message);
        if (typeof b.code === 'string') {
          code = b.code;
        }
      } else {
        message = exception.message;
      }
    } else {
      // Unknown/internal errors: never leak the raw message to the client —
      // log it server-side (with requestId to correlate) and return a safe,
      // generic one instead.
      this.logger.error(
        exception instanceof Error ? exception.stack ?? exception.message : String(exception),
        undefined,
        requestId,
      );
    }

    response.status(status).json({
      error: {
        code: code ?? (HttpStatus[status] as string | undefined) ?? 'INTERNAL_ERROR',
        message,
        requestId,
      },
    });
  }
}
