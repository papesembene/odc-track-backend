import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch(
  Prisma.PrismaClientInitializationError,
  Prisma.PrismaClientKnownRequestError,
)
export class PrismaAvailabilityFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaAvailabilityFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isDbUnavailable =
      exception instanceof Prisma.PrismaClientInitializationError ||
      (exception instanceof Prisma.PrismaClientKnownRequestError &&
        exception.code === 'P1001');

    if (!isDbUnavailable) {
      throw exception;
    }

    // On loggue un message compact et directement exploitable en production.
    // Le but est de voir immediatement qu'il s'agit d'un incident reseau/DB,
    // avec la route impactee, sans devoir lire toute la stack Prisma.
    this.logger.error(
      [
        'Database connectivity incident',
        `method=${request.method}`,
        `path=${request.url}`,
        `prismaCode=${
          exception instanceof Prisma.PrismaClientKnownRequestError
            ? exception.code
            : 'INIT'
        }`,
        `message=${this.extractExceptionMessage(exception)}`,
      ].join(' | '),
    );

    response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
      success: false,
      error: {
        code: 'DB_UNAVAILABLE',
        message: 'Service temporairement indisponible',
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    });
  }

  private extractExceptionMessage(exception: unknown) {
    if (exception instanceof Error) {
      return exception.message;
    }

    return 'Database unavailable';
  }
}
