import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(keyword?: string) {
    const where = this.buildUserSearchWhere(keyword);

    return this.prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        email: true,
        status: true,
        invitedByUserId: true,
        invitationCodeId: true,
        lastLoginAt: true,
        createdAt: true,
        gameBindings: {
          include: {
            gameAccount: {
              include: { game: true },
            },
            server: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        status: true,
        source: true,
        invitedByUserId: true,
        invitationCode: true,
        invitationUsages: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        gameBindings: {
          include: {
            gameAccount: {
              include: { game: true },
            },
            server: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        forumAccounts: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async listGameServers() {
    const servers = await this.prisma.gameServer.findMany({
      include: {
        game: true,
        pluginClients: {
          orderBy: { updatedAt: 'desc' },
        },
        heartbeats: {
          orderBy: { sentAt: 'desc' },
          take: 1,
        },
        _count: {
          select: {
            bindingSessions: true,
            userBindings: true,
            pluginEvents: true,
            heartbeats: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return servers.map((server) => {
      const latestHeartbeat = server.heartbeats[0] || null;

      return {
        id: server.id,
        serverCode: server.serverCode,
        serverName: server.serverName,
        status: server.status,
        region: server.region,
        game: server.game,
        pluginClients: server.pluginClients.map((client) => ({
          id: client.id,
          clientKey: client.clientKey,
          pluginVersion: client.pluginVersion,
          protocolVersion: client.protocolVersion,
          lastHeartbeatAt: client.lastHeartbeatAt,
          status: client.status,
          updatedAt: client.updatedAt,
        })),
        latestHeartbeat,
        counts: server._count,
      };
    });
  }

  async listPluginEvents(filters: {
    serverCode?: string;
    eventType?: string;
    player?: string;
  }) {
    const where: Prisma.PluginEventWhereInput = {};
    const serverCode = String(filters.serverCode || '').trim();
    const eventType = String(filters.eventType || '').trim();
    const player = String(filters.player || '').trim();

    if (serverCode) {
      where.server = { serverCode };
    }
    if (eventType) {
      where.eventType = eventType;
    }
    if (player) {
      where.OR = [
        { playerUuid: { contains: player, mode: 'insensitive' } },
        { displayName: { contains: player, mode: 'insensitive' } },
      ];
    }

    return this.prisma.pluginEvent.findMany({
      where,
      include: {
        server: {
          include: { game: true },
        },
        pluginClient: {
          select: {
            id: true,
            clientKey: true,
          },
        },
      },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    });
  }

  async getForumSummary() {
    const [
      accountCount,
      activeAccountCount,
      failedAccountCount,
      recentAccounts,
      recentTickets,
    ] = await Promise.all([
      this.prisma.forumAccount.count(),
      this.prisma.forumAccount.count({ where: { syncStatus: 'active' } }),
      this.prisma.forumAccount.count({ where: { syncStatus: 'sync_failed' } }),
      this.prisma.forumAccount.findMany({
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              status: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
      this.prisma.forumSsoTicket.findMany({
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
          forumAccount: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    return {
      counts: {
        accounts: accountCount,
        activeAccounts: activeAccountCount,
        failedAccounts: failedAccountCount,
      },
      recentAccounts,
      recentTickets,
    };
  }

  private buildUserSearchWhere(keyword?: string): Prisma.UserWhereInput {
    const normalized = String(keyword || '').trim();
    if (!normalized) {
      return {};
    }

    return {
      OR: [
        { id: normalized },
        { username: { contains: normalized, mode: 'insensitive' } },
        { email: { contains: normalized, mode: 'insensitive' } },
        {
          gameBindings: {
            some: {
              gameAccount: {
                OR: [
                  { gameUserId: { contains: normalized, mode: 'insensitive' } },
                  { normalizedGameUserId: { contains: normalized.toLowerCase(), mode: 'insensitive' } },
                  { displayName: { contains: normalized, mode: 'insensitive' } },
                ],
              },
            },
          },
        },
      ],
    };
  }
}
