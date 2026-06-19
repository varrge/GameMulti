import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BindingSessionStatus, Prisma, UserGameBindingStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AuthenticatedPluginClient } from '../../plugin/plugin-client.decorator';
import { PrismaService } from '../../prisma/prisma.service';

const BINDING_SESSION_TTL_SECONDS = 5 * 60;
const bindingSessionInclude = {
  game: true,
  server: true,
  pluginClient: true,
} satisfies Prisma.BindingSessionInclude;

type BindingSessionWithRelations = Prisma.BindingSessionGetPayload<{
  include: typeof bindingSessionInclude;
}>;

@Injectable()
export class BindingService {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(
    pluginClient: AuthenticatedPluginClient,
    params: {
      serverCode: string;
      gameCode: string;
      platform: string;
      gameUserId: string;
      displayName?: string;
      bindMode: string;
    },
  ) {
    if (params.serverCode !== pluginClient.serverCode || params.gameCode !== pluginClient.gameCode) {
      throw new BadRequestException('Plugin server or game mismatch');
    }

    const expiresAt = new Date(Date.now() + BINDING_SESSION_TTL_SECONDS * 1000);
    const token = await this.createUniqueToken();
    const pairCode = await this.createUniquePairCode();

    const session = await this.prisma.bindingSession.create({
      data: {
        gameId: pluginClient.gameId,
        serverId: pluginClient.serverId,
        pluginClientId: pluginClient.id,
        gameUserId: params.gameUserId,
        platform: params.platform,
        displayName: params.displayName,
        bindMode: params.bindMode,
        token,
        pairCode,
        expiresAt,
        gameAccountSnapshot: {
          gameCode: params.gameCode,
          serverCode: params.serverCode,
          platform: params.platform,
          gameUserId: params.gameUserId,
          displayName: params.displayName,
        },
      },
      include: bindingSessionInclude,
    });

    return {
      sessionId: session.id,
      token: session.token,
      pairCode: session.pairCode,
      expiresIn: BINDING_SESSION_TTL_SECONDS,
      bindUrl: `/bind/confirm?token=${session.token}`,
    };
  }

  async findByToken(token: string) {
    const session = await this.prisma.bindingSession.findUnique({
      where: { token },
      include: bindingSessionInclude,
    });

    return this.presentSession(session);
  }

  async findByPairCode(pairCode: string) {
    const session = await this.prisma.bindingSession.findUnique({
      where: { pairCode: pairCode.trim() },
      include: bindingSessionInclude,
    });

    return this.presentSession(session);
  }

  async confirmBinding(userId: string, sessionId: string) {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.bindingSession.findUnique({
        where: { id: sessionId },
        include: bindingSessionInclude,
      });

      if (!session) {
        throw new NotFoundException('Binding session not found');
      }
      if (session.status !== BindingSessionStatus.pending) {
        throw new BadRequestException('Binding session is not pending');
      }
      if (new Date() > session.expiresAt) {
        await tx.bindingSession.update({
          where: { id: session.id },
          data: { status: BindingSessionStatus.expired },
        });
        throw new BadRequestException('Binding session expired');
      }

      const normalizedGameUserId = this.normalizeGameUserId(session.gameUserId);
      const gameAccount = await tx.gameAccount.upsert({
        where: {
          gameId_platform_normalizedGameUserId: {
            gameId: session.gameId,
            platform: session.platform,
            normalizedGameUserId,
          },
        },
        update: {
          gameUserId: session.gameUserId,
          displayName: session.displayName,
        },
        create: {
          gameId: session.gameId,
          platform: session.platform,
          gameUserId: session.gameUserId,
          normalizedGameUserId,
          displayName: session.displayName,
        },
      });

      const existingOtherBinding = await tx.userGameBinding.findFirst({
        where: {
          gameAccountId: gameAccount.id,
          bindStatus: UserGameBindingStatus.active,
          userId: { not: userId },
        },
      });

      if (existingOtherBinding) {
        throw new BadRequestException('Game account is already bound to another user');
      }

      const binding = await tx.userGameBinding.upsert({
        where: {
          userId_gameAccountId: {
            userId,
            gameAccountId: gameAccount.id,
          },
        },
        update: {
          serverId: session.serverId,
          bindStatus: UserGameBindingStatus.active,
          bindSource: session.bindMode,
          verifiedBy: 'web_confirm',
          verifiedAt: new Date(),
        },
        create: {
          userId,
          gameAccountId: gameAccount.id,
          serverId: session.serverId,
          bindStatus: UserGameBindingStatus.active,
          bindSource: session.bindMode,
          verifiedBy: 'web_confirm',
          verifiedAt: new Date(),
        },
        include: {
          gameAccount: {
            include: { game: true },
          },
          server: true,
        },
      });

      await tx.bindingSession.update({
        where: { id: session.id },
        data: {
          status: BindingSessionStatus.confirmed,
          usedAt: new Date(),
          usedByUserId: userId,
          confirmedBindingId: binding.id,
          confirmedGameAccountId: gameAccount.id,
        },
      });

      return binding;
    });
  }

  async listUserBindings(userId: string) {
    return this.prisma.userGameBinding.findMany({
      where: { userId },
      include: {
        gameAccount: {
          include: { game: true },
        },
        server: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async presentSession(
    session: BindingSessionWithRelations | null,
  ) {
    if (!session) {
      throw new NotFoundException('Binding session not found');
    }

    if (session.status === BindingSessionStatus.pending && new Date() > session.expiresAt) {
      const expired = await this.prisma.bindingSession.update({
        where: { id: session.id },
        data: { status: BindingSessionStatus.expired },
        include: bindingSessionInclude,
      });
      return this.publicSession(expired);
    }

    return this.publicSession(session);
  }

  private publicSession(session: {
    id: string;
    platform: string;
    gameUserId: string;
    displayName: string | null;
    bindMode: string;
    status: BindingSessionStatus;
    expiresAt: Date;
    game: { code: string; name: string };
    server: { serverCode: string; serverName: string };
  }) {
    return {
      id: session.id,
      game: session.game,
      server: session.server,
      platform: session.platform,
      gameUserId: session.gameUserId,
      displayName: session.displayName,
      bindMode: session.bindMode,
      status: session.status,
      expiresAt: session.expiresAt,
      expired: new Date() > session.expiresAt,
    };
  }

  private normalizeGameUserId(value: string) {
    return value.trim().toLowerCase();
  }

  private async createUniqueToken() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const token = randomBytes(24).toString('hex');
      const existing = await this.prisma.bindingSession.findUnique({ where: { token } });
      if (!existing) {
        return token;
      }
    }
    throw new BadRequestException('Failed to allocate binding token');
  }

  private async createUniquePairCode() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const pairCode = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
      const existing = await this.prisma.bindingSession.findUnique({ where: { pairCode } });
      if (!existing) {
        return pairCode;
      }
    }
    throw new BadRequestException('Failed to allocate binding pair code');
  }
}
