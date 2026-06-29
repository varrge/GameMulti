import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BindingSessionStatus, ForumAccountSyncStatus, Prisma, UserGameBindingStatus } from '@prisma/client';
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

const bindingResultInclude = {
  gameAccount: {
    include: { game: true },
  },
  server: true,
} satisfies Prisma.UserGameBindingInclude;

export type DiscourseBindingIdentity = {
  discourseUserId: string;
  discourseUsername: string;
  discourseEmail?: string | null;
  localUserId?: string | null;
};

@Injectable()
export class BindingService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

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
      publicBindUrl: this.publicBindUrl(session.token),
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
    const identity = await this.resolveLocalUserDiscourseIdentity(userId);
    return this.confirmBindingForDiscourseUser(identity, sessionId);
  }

  async confirmBindingForDiscourseUser(identity: DiscourseBindingIdentity, sessionId: string) {
    const discourseIdentity = this.normalizeDiscourseIdentity(identity);

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
        },
      });

      if (
        existingOtherBinding
        && !(await this.bindingBelongsToDiscourseUser(tx, existingOtherBinding, discourseIdentity.discourseUserId))
      ) {
        throw new BadRequestException('Game account is already bound to another user');
      }

      const bindingData = {
        ...this.bindingIdentityData(discourseIdentity),
        serverId: session.serverId,
        bindStatus: UserGameBindingStatus.active,
        bindSource: session.bindMode,
        verifiedBy: 'web_confirm',
        verifiedAt: new Date(),
      };

      const binding = existingOtherBinding
        ? await tx.userGameBinding.update({
          where: { id: existingOtherBinding.id },
          data: bindingData,
          include: bindingResultInclude,
        })
        : await tx.userGameBinding.upsert({
          where: {
            discourseUserId_gameAccountId: {
              discourseUserId: discourseIdentity.discourseUserId,
              gameAccountId: gameAccount.id,
            },
          },
          update: bindingData,
          create: {
            ...bindingData,
            gameAccountId: gameAccount.id,
          },
          include: bindingResultInclude,
        });

      await tx.bindingSession.update({
        where: { id: session.id },
        data: {
          status: BindingSessionStatus.confirmed,
          usedAt: new Date(),
          usedByUserId: discourseIdentity.localUserId ?? null,
          usedByDiscourseUserId: discourseIdentity.discourseUserId,
          usedByDiscourseUsername: discourseIdentity.discourseUsername,
          confirmedBindingId: binding.id,
          confirmedGameAccountId: gameAccount.id,
        },
      });

      return binding;
    });
  }

  async listUserBindings(userId: string) {
    const account = await this.prisma.forumAccount.findUnique({
      where: {
        userId_forumProvider: {
          userId,
          forumProvider: this.provider,
        },
      },
      select: {
        externalUid: true,
        forumUserId: true,
      },
    });

    const discourseUserId = account?.externalUid || account?.forumUserId;

    return this.prisma.userGameBinding.findMany({
      where: {
        OR: discourseUserId
          ? [
            { discourseUserId },
            { userId },
          ]
          : [
            { userId },
          ],
      },
      include: bindingResultInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async listDiscourseUserBindings(discourseUserId: string) {
    const normalized = this.normalizeRequiredString(discourseUserId, 'discourseUserId');
    return this.prisma.userGameBinding.findMany({
      where: { discourseUserId: normalized },
      include: bindingResultInclude,
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

  private normalizeDiscourseIdentity(identity: DiscourseBindingIdentity): Required<DiscourseBindingIdentity> {
    const discourseUserId = this.normalizeRequiredString(identity.discourseUserId, 'discourseUserId');
    const discourseUsername = String(identity.discourseUsername || '').trim() || `discourse_${discourseUserId}`;
    return {
      discourseUserId,
      discourseUsername,
      discourseEmail: identity.discourseEmail?.trim().toLowerCase() || null,
      localUserId: identity.localUserId || null,
    };
  }

  private bindingIdentityData(identity: Required<DiscourseBindingIdentity>) {
    return {
      userId: identity.localUserId || undefined,
      discourseUserId: identity.discourseUserId,
      discourseUsername: identity.discourseUsername,
      discourseEmail: identity.discourseEmail,
    };
  }

  private async bindingBelongsToDiscourseUser(
    tx: Prisma.TransactionClient,
    binding: { userId: string | null; discourseUserId: string | null },
    discourseUserId: string,
  ) {
    if (binding.discourseUserId) {
      return binding.discourseUserId === discourseUserId;
    }
    if (!binding.userId) {
      return false;
    }

    const account = await tx.forumAccount.findUnique({
      where: {
        userId_forumProvider: {
          userId: binding.userId,
          forumProvider: this.provider,
        },
      },
      select: {
        externalUid: true,
        forumUserId: true,
      },
    });

    return account?.externalUid === discourseUserId || account?.forumUserId === discourseUserId;
  }

  private async resolveLocalUserDiscourseIdentity(userId: string): Promise<DiscourseBindingIdentity> {
    const account = await this.prisma.forumAccount.findUnique({
      where: {
        userId_forumProvider: {
          userId,
          forumProvider: this.provider,
        },
      },
    });

    if (account) {
      return {
        discourseUserId: account.externalUid || account.forumUserId,
        discourseUsername: account.forumUsername,
        discourseEmail: account.forumEmail,
        localUserId: userId,
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const created = await this.prisma.forumAccount.create({
      data: {
        userId: user.id,
        forumProvider: this.provider,
        forumUserId: user.id,
        forumUsername: user.username,
        forumEmail: user.email,
        externalUid: user.id,
        syncStatus: ForumAccountSyncStatus.active,
        mappingSource: 'local_compat_binding',
        lastSyncedAt: new Date(),
      },
    });

    return {
      discourseUserId: created.externalUid,
      discourseUsername: created.forumUsername,
      discourseEmail: created.forumEmail,
      localUserId: user.id,
    };
  }

  private normalizeRequiredString(value: string, field: string) {
    const normalized = String(value || '').trim();
    if (!normalized) {
      throw new BadRequestException(`${field} is required`);
    }
    return normalized;
  }

  private get provider() {
    return this.config.get<string>('FORUM_PROVIDER', 'discourse');
  }

  private publicBindUrl(token: string) {
    return new URL(`/bind/confirm?token=${token}`, this.bridgePublicOrigin).toString();
  }

  private get bridgePublicOrigin() {
    return this.config.get<string>('BRIDGE_PUBLIC_ORIGIN')
      || this.config.get<string>('PUBLIC_ORIGIN')
      || this.config.get<string>('APP_URL')
      || 'http://localhost:8080';
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
