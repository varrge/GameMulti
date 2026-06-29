import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { AuthenticatedPluginClient } from '../../plugin/plugin-client.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { encryptSecret } from '../../security/secret-vault';
import { ClaimPluginInstallationDto } from './dto/claim-plugin-installation.dto';
import { RecordPluginEventDto } from './dto/record-plugin-event.dto';
import { RecordServerHeartbeatDto } from './dto/record-server-heartbeat.dto';

@Injectable()
export class GameService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async claimInstallation(dto: ClaimPluginInstallationDto, requestIp: string | null) {
    const tokenHash = this.hashToken(dto.installToken.trim());
    const installToken = await this.prisma.pluginInstallToken.findUnique({ where: { tokenHash } });

    if (!installToken || installToken.status !== 'active' || installToken.usedAt) {
      throw new UnauthorizedException('Invalid install token');
    }
    if (installToken.expiresAt <= new Date()) {
      await this.prisma.pluginInstallToken.update({
        where: { id: installToken.id },
        data: { status: 'expired' },
      });
      throw new UnauthorizedException('Install token expired');
    }

    const game = await this.prisma.game.findUnique({ where: { code: installToken.gameCode } });
    if (!game || game.status !== 'active') {
      throw new NotFoundException('Game not found');
    }

    const clientSecret = `gmps_${randomBytes(32).toString('base64url')}`;
    const serverCode = dto.serverCode?.trim() || await this.uniqueServerCode(dto.serverName);
    let result: {
      server: { id: string; serverCode: string; serverName: string; status: string };
      client: { id: string; clientKey: string; status: string };
    };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const server = await tx.gameServer.create({
          data: {
            gameId: game.id,
            serverCode,
            serverName: dto.serverName.trim(),
            region: dto.region?.trim() || null,
            endpointHost: dto.publicHost?.trim() || requestIp,
            endpointPort: dto.publicPort || 25565,
            adapterType: 'minecraft',
            status: 'pending',
            meta: {
              installClaimIp: requestIp,
              installClaimedAt: new Date().toISOString(),
            },
          },
        });
        const client = await tx.serverPluginClient.create({
          data: {
            serverId: server.id,
            clientKey: `gmpc_${this.slug(server.serverCode)}_${randomBytes(9).toString('base64url')}`,
            clientSecretHash: encryptSecret(clientSecret, this.appSecret),
            pluginVersion: dto.pluginVersion?.trim() || null,
            protocolVersion: dto.protocolVersion?.trim() || '2026-06-mvp',
            status: 'active',
          },
        });

        await tx.pluginInstallToken.update({
          where: { id: installToken.id },
          data: {
            status: 'used',
            usedAt: new Date(),
            usedByServerId: server.id,
          },
        });

        return { server, client };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('Server code or plugin client key already exists');
      }
      throw error;
    }

    return {
      server: {
        id: result.server.id,
        serverCode: result.server.serverCode,
        serverName: result.server.serverName,
        status: result.server.status,
        gameCode: game.code,
      },
      pluginClient: {
        id: result.client.id,
        clientKey: result.client.clientKey,
        clientSecret,
        status: result.client.status,
      },
      message: 'Server is pending admin approval',
    };
  }

  async recordPluginEvent(pluginClient: AuthenticatedPluginClient, dto: RecordPluginEventDto) {
    this.assertServerMatchesPlugin(pluginClient, dto.serverCode);

    try {
      const event = await this.prisma.pluginEvent.create({
        data: {
          pluginClientId: pluginClient.id,
          serverId: pluginClient.serverId,
          eventId: dto.eventId,
          eventType: dto.eventType,
          playerUuid: dto.playerUuid,
          displayName: dto.displayName,
          occurredAt: new Date(dto.occurredAt),
          metadata: this.toPrismaJson(dto.metadata),
        },
      });

      return {
        ok: true,
        eventId: event.eventId,
        storedEventId: event.id,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return {
          ok: true,
          eventId: dto.eventId,
          duplicate: true,
        };
      }
      throw error;
    }
  }

  async recordHeartbeat(pluginClient: AuthenticatedPluginClient, dto: RecordServerHeartbeatDto) {
    this.assertServerMatchesPlugin(pluginClient, dto.serverCode);

    try {
      await this.prisma.gameServer.update({
        where: { id: pluginClient.serverId },
        data: {
          endpointHost: this.stringMeta(dto.metadata, 'publicHost') || undefined,
          endpointPort: this.numberMeta(dto.metadata, 'publicPort') || undefined,
        },
      });
      const heartbeat = await this.prisma.gameServerHeartbeat.create({
        data: {
          pluginClientId: pluginClient.id,
          serverId: pluginClient.serverId,
          statusId: dto.statusId,
          healthy: dto.healthy,
          onlineCount: dto.onlineCount,
          queueDepth: dto.queueDepth,
          sentAt: new Date(dto.sentAt),
          metadata: this.toPrismaJson(dto.metadata),
        },
      });

      return {
        ok: true,
        statusId: heartbeat.statusId,
        storedHeartbeatId: heartbeat.id,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return {
          ok: true,
          statusId: dto.statusId,
          duplicate: true,
        };
      }
      throw error;
    }
  }

  private assertServerMatchesPlugin(pluginClient: AuthenticatedPluginClient, serverCode: string) {
    if (serverCode !== pluginClient.serverCode) {
      throw new BadRequestException('Plugin server mismatch');
    }
  }

  private toPrismaJson(value: Record<string, unknown> | undefined) {
    return value as Prisma.InputJsonValue | undefined;
  }

  private stringMeta(value: Record<string, unknown> | undefined, key: string) {
    const item = value?.[key];
    return typeof item === 'string' && item.trim() ? item.trim() : null;
  }

  private numberMeta(value: Record<string, unknown> | undefined, key: string) {
    const item = value?.[key];
    return typeof item === 'number' && Number.isInteger(item) ? item : null;
  }

  private async uniqueServerCode(serverName: string) {
    const base = this.slug(serverName);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `${base}-${randomBytes(3).toString('hex')}`;
      const existing = await this.prisma.gameServer.findUnique({ where: { serverCode: candidate } });
      if (!existing) {
        return candidate;
      }
    }
    throw new BadRequestException('Failed to allocate server code');
  }

  private slug(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'server';
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private get appSecret() {
    return this.config.get<string>('APP_SECRET', 'replace-with-a-long-random-secret');
  }
}
