import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

/**
 * Global exception filter producing a consistent JSON error envelope for
 * every failure, including unexpected TypeORM/driver errors.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, error } = this.normalize(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorResponseBody = {
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(body);
  }

  private normalize(exception: unknown): {
    status: number;
    message: string | string[];
    error: string;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return { status, message: payload, error: exception.name };
      }

      const obj = payload as Record<string, unknown>;
      const message = (obj.message as string | string[] | undefined) ?? exception.message;
      const error = (obj.error as string | undefined) ?? exception.name;
      return { status, message, error };
    }

    if (exception instanceof QueryFailedError) {
      const driverError = exception.driverError as { code?: string; errno?: number };
      // Duplicate key (MySQL 1062 / SQLite 19).
      if (driverError?.errno === 1062 || driverError?.code === '23505' || driverError?.code === 'SQLITE_CONSTRAINT') {
        return {
          status: HttpStatus.CONFLICT,
          message: 'A record with these values already exists.',
          error: 'Conflict',
        };
      }
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Database request failed.',
        error: 'QueryFailedError',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error.',
      error: 'InternalServerError',
    };
  }
}
