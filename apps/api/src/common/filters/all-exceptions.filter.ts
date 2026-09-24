import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Внутренняя ошибка сервера';
    let code: string | undefined;
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const obj = body as Record<string, unknown>;
        message = Array.isArray(obj.message)
          ? (obj.message as string[]).join(', ')
          : String(obj.message ?? exception.message);
        code = typeof obj.code === 'string' ? obj.code : undefined;
        details = obj.details;
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
      message = 'Внутренняя ошибка сервера';
    }

    response.status(status).json({
      statusCode: status,
      message,
      ...(code ? { code } : {}),
      ...(details !== undefined ? { details } : {}),
    });
  }
}
