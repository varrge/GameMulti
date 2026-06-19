import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedPluginClient } from '../../plugin/plugin-client.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { RecordPluginEventDto } from './dto/record-plugin-event.dto';
import { RecordServerHeartbeatDto } from './dto/record-server-heartbeat.dto';

@Injectable()
export class GameService {
  constructor(private readonly prisma: PrismaService) {}

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
}
