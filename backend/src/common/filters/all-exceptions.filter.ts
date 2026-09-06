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
import { ErrorTrackingService } from '../observability/error-tracking.service';

interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

/**
 * Global exception filter producing a consistent JSON error envelope for every
 * failure. Server errors (5xx) and database failures are also persisted through
 * the error-tracking service (with secrets redacted) for the admin dashboard,
 * while 4xx client errors are returned without being tracked as incidents.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly errorTracking?: ErrorTrackingService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { user?: { id?: string } }>();

    const { status, message, error } = this.normalize(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      void this.errorTracking?.track({
        level: status >= 500 ? 'error' : 'warning',
        source: 'http',
        message: exception instanceof Error ? exception.message : String(exception),
        stack: exception instanceof Error ? exception.stack ?? null : null,
        method: request.method,
        path: request.url,
        statusCode: status,
        userId: request.user?.id ?? null,
        context: {
          query: request.query,
          headers: { ...request.headers },
        },
      });
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
      // Never leak raw SQL/driver details to clients; log them server-side.
      this.logger.error(
        `Database query failed: ${exception.message}`,
        exception.stack,
      );
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
