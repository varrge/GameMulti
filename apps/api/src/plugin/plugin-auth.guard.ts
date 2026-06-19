import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { verifyPluginSignature } from '../security/plugin-signature';

const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

@Injectable()
export class PluginAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      method: string;
      originalUrl?: string;
      url: string;
      body?: unknown;
      headers: Record<string, string | string[] | undefined>;
      pluginClient?: unknown;
    }>();

    const clientKey = this.readHeader(request.headers, 'x-gm-client-key');
    const timestamp = this.readHeader(request.headers, 'x-gm-timestamp');
    const nonce = this.readHeader(request.headers, 'x-gm-nonce');
    const signature = this.readHeader(request.headers, 'x-gm-signature');

    if (!clientKey || !timestamp || !nonce || !signature) {
      throw new UnauthorizedException('Missing plugin signature headers');
    }

    const requestTime = Number(timestamp);
    if (!Number.isFinite(requestTime)) {
      throw new UnauthorizedException('Invalid plugin timestamp');
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - requestTime) > MAX_CLOCK_SKEW_SECONDS) {
      throw new UnauthorizedException('Plugin timestamp outside allowed window');
    }

    const client = await this.prisma.serverPluginClient.findUnique({
      where: { clientKey },
      include: {
        server: {
          include: {
            game: true,
          },
        },
      },
    });

    if (!client || client.status !== 'active' || client.server.status !== 'active' || client.server.game.status !== 'active') {
      throw new UnauthorizedException('Plugin client is not active');
    }

    const body = this.canonicalBody(request.body);
    const valid = verifyPluginSignature(
      {
        method: request.method,
        path: this.pathWithoutQuery(request.originalUrl || request.url),
        timestamp,
        nonce,
        body,
      },
      client.clientSecretHash,
      signature,
    );

    if (!valid) {
      throw new UnauthorizedException('Invalid plugin signature');
    }

    request.pluginClient = {
      id: client.id,
      clientKey: client.clientKey,
      serverId: client.serverId,
      serverCode: client.server.serverCode,
      gameId: client.server.gameId,
      gameCode: client.server.game.code,
    };

    await this.prisma.serverPluginClient.update({
      where: { id: client.id },
      data: { lastHeartbeatAt: new Date() },
    });

    return true;
  }

  private readHeader(headers: Record<string, string | string[] | undefined>, name: string) {
    const value = headers[name] || headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }

  private pathWithoutQuery(value: string) {
    return value.split('?')[0] || value;
  }

  private canonicalBody(body: unknown) {
    if (body === undefined || body === null) {
      return '';
    }
    return JSON.stringify(body);
  }
}
