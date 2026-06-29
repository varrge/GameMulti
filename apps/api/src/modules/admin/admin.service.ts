import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { encryptSecret } from '../../security/secret-vault';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

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
        endpointHost: server.endpointHost,
        endpointPort: server.endpointPort,
        game: server.game,
        pluginClients: server.pluginClients.map((client) => ({
          id: client.id,
          clientKey: client.clientKey,
          pluginVersion: client.pluginVersion,
          protocolVersion: client.protocolVersion,
          lastHeartbeatAt: client.lastHeartbeatAt,
          expiresAt: client.expiresAt,
          status: client.status,
          updatedAt: client.updatedAt,
        })),
        latestHeartbeat,
        counts: server._count,
      };
    });
  }

  async createPluginClient(params: {
    serverCode: string;
    pluginVersion?: string;
    protocolVersion?: string;
    expiresInHours?: number;
  }) {
    const serverCode = params.serverCode.trim();
    const server = await this.prisma.gameServer.findUnique({
      where: { serverCode },
      include: { game: true },
    });

    if (!server) {
      throw new NotFoundException('Game server not found');
    }
    if (server.status !== 'active' || server.game.status !== 'active') {
      throw new BadRequestException('Game server is not active');
    }

    const clientSecret = `gmps_${randomBytes(32).toString('base64url')}`;
    const expiresInHours = params.expiresInHours ?? 24;
    const expiresAt = expiresInHours > 0
      ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
      : null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const clientKey = `gmpc_${this.slug(server.serverCode)}_${randomBytes(9).toString('base64url')}`;

      try {
        const client = await this.prisma.serverPluginClient.create({
          data: {
            serverId: server.id,
            clientKey,
            clientSecretHash: encryptSecret(clientSecret, this.appSecret),
            pluginVersion: params.pluginVersion?.trim() || 'temporary',
            protocolVersion: params.protocolVersion?.trim() || '2026-06-mvp',
            expiresAt,
            status: 'active',
          },
        });

        return {
          server: {
            id: server.id,
            serverCode: server.serverCode,
            serverName: server.serverName,
            gameCode: server.game.code,
          },
          pluginClient: {
            id: client.id,
            clientKey: client.clientKey,
            clientSecret,
            status: client.status,
            pluginVersion: client.pluginVersion,
            protocolVersion: client.protocolVersion,
            expiresAt: client.expiresAt,
          },
          bridgePublicOrigin: this.bridgePublicOrigin,
        };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          continue;
        }
        throw error;
      }
    }

    throw new BadRequestException('Failed to allocate plugin client key');
  }

  async createPluginInstallToken(params: {
    gameCode?: string;
    expiresInHours?: number;
  }) {
    const gameCode = params.gameCode?.trim() || 'minecraft';
    const game = await this.prisma.game.findUnique({ where: { code: gameCode } });
    if (!game || game.status !== 'active') {
      throw new NotFoundException('Game not found');
    }

    const installToken = `gmit_${randomBytes(32).toString('base64url')}`;
    const expiresInHours = params.expiresInHours ?? 24;
    const token = await this.prisma.pluginInstallToken.create({
      data: {
        tokenHash: this.hashToken(installToken),
        gameCode,
        expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000),
      },
    });

    return {
      id: token.id,
      installToken,
      gameCode: token.gameCode,
      expiresAt: token.expiresAt,
      status: token.status,
    };
  }

  async updateGameServerStatus(serverId: string, status: string) {
    const server = await this.prisma.gameServer.update({
      where: { id: serverId },
      data: { status },
      include: {
        game: true,
        pluginClients: {
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    return {
      id: server.id,
      serverCode: server.serverCode,
      serverName: server.serverName,
      status: server.status,
      game: server.game,
      pluginClients: server.pluginClients.map((client) => ({
        id: client.id,
        clientKey: client.clientKey,
        status: client.status,
        expiresAt: client.expiresAt,
      })),
    };
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

  private slug(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'server';
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private get appSecret() {
    return this.config.get<string>('APP_SECRET', 'replace-with-a-long-random-secret');
  }

  private get bridgePublicOrigin() {
    return this.config.get<string>('BRIDGE_PUBLIC_ORIGIN')
      || this.config.get<string>('PUBLIC_ORIGIN')
      || this.config.get<string>('APP_URL')
      || 'http://localhost:8080';
  }
}
