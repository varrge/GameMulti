import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSecretIfNeeded } from '../security/secret-vault';
import { verifyPluginSignature } from '../security/plugin-signature';
import { PLUGIN_ERROR_CODES, PluginApiError } from './plugin-api-error';

const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const NONCE_RETENTION_SECONDS = MAX_CLOCK_SKEW_SECONDS * 2;
const DEFAULT_PROTOCOL_VERSION = '2026-06-mvp';

@Injectable()
export class PluginAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      method: string;
      originalUrl?: string;
      url: string;
      body?: unknown;
      rawBody?: Buffer;
      headers: Record<string, string | string[] | undefined>;
      pluginClient?: unknown;
    }>();

    const clientKey = this.readHeader(request.headers, 'x-gm-client-key');
    const timestamp = this.readHeader(request.headers, 'x-gm-timestamp');
    const nonce = this.readHeader(request.headers, 'x-gm-nonce');
    const signature = this.readHeader(request.headers, 'x-gm-signature');
    const protocolVersion = this.readHeader(request.headers, 'x-gm-protocol-version');

    if (!clientKey || !timestamp || !nonce || !signature) {
      throw this.authenticationFailed('Missing plugin signature headers');
    }
    if (!/^[0-9a-f]{64}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(signature)) {
      throw this.authenticationFailed('Invalid plugin nonce or signature format');
    }

    const requestTime = Number(timestamp);
    if (!Number.isInteger(requestTime)) {
      throw this.authenticationFailed('Invalid plugin timestamp');
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - requestTime) > MAX_CLOCK_SKEW_SECONDS) {
      throw new PluginApiError(
        HttpStatus.UNAUTHORIZED,
        PLUGIN_ERROR_CODES.clockSkew,
        'Plugin timestamp outside allowed window',
        true,
      );
    }

    const client = await this.prisma.serverPluginClient.findUnique({
      where: { clientKey },
      include: { server: { include: { game: true } } },
    });

    if (!client || client.status !== 'active') {
      throw this.authenticationFailed('Plugin credential is invalid or inactive');
    }
    if (client.expiresAt && client.expiresAt <= new Date()) {
      throw this.authenticationFailed('Plugin credential expired');
    }

    const valid = verifyPluginSignature(
      {
        method: request.method,
        path: this.pathWithoutQuery(request.originalUrl || request.url),
        timestamp,
        nonce,
        body: this.requestBody(request),
      },
      this.decryptPluginSecret(client.clientSecretHash),
      signature,
    );
    if (!valid) {
      throw this.authenticationFailed('Invalid plugin signature');
    }
    if (!protocolVersion) {
      throw new PluginApiError(
        426,
        PLUGIN_ERROR_CODES.protocolUnsupported,
        'Missing plugin protocol version',
        false,
        { supportedVersions: this.supportedProtocolVersions() },
      );
    }

    if (client.server.status === 'pending') {
      throw new PluginApiError(
        HttpStatus.FORBIDDEN,
        PLUGIN_ERROR_CODES.serverPendingApproval,
        'Server is pending approval',
        true,
      );
    }
    if (client.server.status === 'blocked' || client.server.status === 'disabled') {
      throw new PluginApiError(
        HttpStatus.FORBIDDEN,
        PLUGIN_ERROR_CODES.serverBlocked,
        'Server is blocked',
      );
    }
    if (client.server.game.status !== 'active') {
      throw new PluginApiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        PLUGIN_ERROR_CODES.serviceUnavailable,
        'Game service is temporarily unavailable',
        true,
      );
    }

    const supportedVersions = this.supportedProtocolVersions();
    if (!supportedVersions.includes(protocolVersion) || client.protocolVersion !== protocolVersion) {
      throw new PluginApiError(
        426,
        PLUGIN_ERROR_CODES.protocolUnsupported,
        'Plugin protocol version is not supported for this credential',
        false,
        { supportedVersions },
      );
    }

    await this.rememberNonce(client.id, nonce, requestTime);

    request.pluginClient = {
      id: client.id,
      clientKey: client.clientKey,
      serverId: client.serverId,
      serverCode: client.server.serverCode,
      gameId: client.server.gameId,
      gameCode: client.server.game.code,
      protocolVersion,
    };

    await this.prisma.serverPluginClient.update({
      where: { id: client.id },
      data: { lastHeartbeatAt: new Date() },
    });
    return true;
  }

  private async rememberNonce(pluginClientId: string, nonce: string, requestTime: number) {
    const now = new Date();
    await this.prisma.pluginRequestNonce.deleteMany({ where: { expiresAt: { lt: now } } });
    try {
      await this.prisma.pluginRequestNonce.create({
        data: {
          pluginClientId,
          nonce,
          timestamp: new Date(requestTime * 1000),
          expiresAt: new Date(now.getTime() + NONCE_RETENTION_SECONDS * 1000),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new PluginApiError(
          HttpStatus.CONFLICT,
          PLUGIN_ERROR_CODES.nonceReplay,
          'Plugin nonce already used',
        );
      }
      throw error;
    }
  }

  private authenticationFailed(message: string) {
    return new PluginApiError(HttpStatus.UNAUTHORIZED, PLUGIN_ERROR_CODES.authenticationFailed, message);
  }

  private supportedProtocolVersions() {
    const configured = this.config.get<string>('PLUGIN_PROTOCOL_VERSIONS', DEFAULT_PROTOCOL_VERSION);
    return configured.split(',').map((value) => value.trim()).filter(Boolean);
  }

  private readHeader(headers: Record<string, string | string[] | undefined>, name: string) {
    const value = headers[name] || headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }

  private pathWithoutQuery(value: string) {
    return value.split('?')[0] || value;
  }

  private requestBody(request: { body?: unknown; rawBody?: Buffer }) {
    if (Buffer.isBuffer(request.rawBody)) {
      return request.rawBody;
    }
    if (request.body === undefined || request.body === null) {
      return '';
    }
    throw new PluginApiError(
      HttpStatus.SERVICE_UNAVAILABLE,
      PLUGIN_ERROR_CODES.serviceUnavailable,
      'Raw plugin request body is unavailable',
      true,
    );
  }

  private decryptPluginSecret(value: string) {
    try {
      const appSecret = this.config.get<string>('APP_SECRET', 'replace-with-a-long-random-secret');
      return decryptSecretIfNeeded(value, appSecret);
    } catch {
      throw this.authenticationFailed('Plugin credential is invalid');
    }
  }
}
