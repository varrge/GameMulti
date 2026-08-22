import { HttpException, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export const PLUGIN_ERROR_CODES = {
  authenticationFailed: 'AUTHENTICATION_FAILED',
  clockSkew: 'CLOCK_SKEW',
  nonceReplay: 'NONCE_REPLAY',
  serverPendingApproval: 'SERVER_PENDING_APPROVAL',
  serverBlocked: 'SERVER_BLOCKED',
  rateLimited: 'RATE_LIMITED',
  invalidRequest: 'INVALID_REQUEST',
  protocolUnsupported: 'PROTOCOL_UNSUPPORTED',
  serviceUnavailable: 'SERVICE_UNAVAILABLE',
  idempotencyConflict: 'IDEMPOTENCY_CONFLICT',
} as const;

export type PluginErrorCode = typeof PLUGIN_ERROR_CODES[keyof typeof PLUGIN_ERROR_CODES];

export type PluginErrorBody = {
  code: PluginErrorCode;
  message: string;
  retryable: boolean;
  requestId: string;
  serverTime?: number;
  details?: Record<string, unknown>;
};

export class PluginApiError extends HttpException {
  constructor(
    status: HttpStatus | number,
    code: PluginErrorCode,
    message: string,
    retryable = false,
    details?: Record<string, unknown>,
  ) {
    const body: PluginErrorBody = {
      code,
      message,
      retryable,
      requestId: randomUUID(),
      ...(code === PLUGIN_ERROR_CODES.clockSkew
        ? { serverTime: Math.floor(Date.now() / 1000) }
        : {}),
      ...(details ? { details } : {}),
    };
    super(body, status);
  }
}
