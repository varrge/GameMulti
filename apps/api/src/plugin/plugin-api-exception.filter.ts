import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Request, Response } from 'express';
import { PLUGIN_ERROR_CODES, PluginApiError, PluginErrorBody } from './plugin-api-error';

@Catch()
export class PluginApiExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    if (!this.isPluginRequest(request.path)) {
      super.catch(exception, host);
      return;
    }

    const mapped = this.mapException(exception);
    response.setHeader('Date', new Date().toUTCString());
    response.status(mapped.status).json(mapped.body);
  }

  private isPluginRequest(path: string) {
    return path.startsWith('/api/plugin/') || path === '/api/game-servers/heartbeat';
  }

  private mapException(exception: unknown): { status: number; body: PluginErrorBody } {
    if (exception instanceof PluginApiError) {
      return {
        status: exception.getStatus(),
        body: exception.getResponse() as PluginErrorBody,
      };
    }

    if (exception instanceof BadRequestException) {
      return this.fromPluginError(new PluginApiError(
        HttpStatus.BAD_REQUEST,
        PLUGIN_ERROR_CODES.invalidRequest,
        this.message(exception, 'Invalid request'),
      ));
    }

    if (exception instanceof NotFoundException) {
      return this.fromPluginError(new PluginApiError(
        HttpStatus.NOT_FOUND,
        PLUGIN_ERROR_CODES.invalidRequest,
        this.message(exception, 'Resource not found'),
      ));
    }

    if (exception instanceof ServiceUnavailableException) {
      return this.fromPluginError(new PluginApiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        PLUGIN_ERROR_CODES.serviceUnavailable,
        'Service temporarily unavailable',
        true,
      ));
    }

    if (exception instanceof HttpException && exception.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
      return this.fromPluginError(new PluginApiError(
        HttpStatus.TOO_MANY_REQUESTS,
        PLUGIN_ERROR_CODES.rateLimited,
        'Rate limit exceeded',
        true,
      ));
    }

    if (exception instanceof HttpException) {
      return this.fromPluginError(new PluginApiError(
        exception.getStatus(),
        PLUGIN_ERROR_CODES.serviceUnavailable,
        this.message(exception, 'Request failed'),
        exception.getStatus() >= 500,
      ));
    }

    return this.fromPluginError(new PluginApiError(
      HttpStatus.SERVICE_UNAVAILABLE,
      PLUGIN_ERROR_CODES.serviceUnavailable,
      'Service temporarily unavailable',
      true,
    ));
  }

  private fromPluginError(error: PluginApiError) {
    return { status: error.getStatus(), body: error.getResponse() as PluginErrorBody };
  }

  private message(exception: HttpException, fallback: string) {
    const value = exception.getResponse();
    if (typeof value === 'string') {
      return value;
    }
    if (value && typeof value === 'object' && 'message' in value) {
      const message = value.message;
      return Array.isArray(message) ? message.join('; ') : String(message);
    }
    return fallback;
  }
}
