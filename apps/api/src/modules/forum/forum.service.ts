import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ForumAccountSyncStatus, ForumSsoTicketStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import {
  decodeDiscoursePayload,
  encodeDiscoursePayload,
  signDiscoursePayload,
  verifyDiscoursePayload,
} from '../../security/discourse-sso';

const TICKET_TTL_SECONDS = 5 * 60;

@Injectable()
export class ForumService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async getEntry(userId: string) {
    const account = await this.getOrCreateForumAccount(userId);

    return {
      provider: this.provider,
      forumOrigin: this.forumOrigin,
      forumEntryUrl: this.absoluteForumUrl(this.forumEntryPath),
      account: this.publicForumAccount(account),
      ssoStartUrl: '/api/forum/sso/start',
    };
  }

  async startSso(params: { userId: string; returnPath?: string; request?: Request }) {
    const account = await this.getOrCreateForumAccount(params.userId);
    const expiresAt = new Date(Date.now() + TICKET_TTL_SECONDS * 1000);
    const ticketValue = randomBytes(24).toString('hex');

    const ticket = await this.prisma.forumSsoTicket.create({
      data: {
        userId: params.userId,
        forumAccountId: account.id,
        forumProvider: this.provider,
        ticket: ticketValue,
        redirectUrl: params.returnPath || this.forumEntryPath,
        expiresAt,
        requestIp: params.request?.ip,
        requestUserAgent: this.requestUserAgent(params.request),
      },
    });

    const payload = encodeDiscoursePayload({
      nonce: ticket.ticket,
      return_sso_url: this.callbackUrl,
    });
    const sig = signDiscoursePayload(payload, this.ssoSecret);
    const forumSsoUrl = new URL('/session/sso_login', this.forumOrigin);
    forumSsoUrl.searchParams.set('sso', payload);
    forumSsoUrl.searchParams.set('sig', sig);

    return {
      provider: this.provider,
      forumSsoUrl: forumSsoUrl.toString(),
      ticket: ticket.ticket,
      expiresIn: TICKET_TTL_SECONDS,
      account: this.publicForumAccount(account),
      payload,
      sig,
    };
  }

  async consumeCallback(params: { sso?: string; sig?: string }) {
    if (!params.sso || !params.sig) {
      throw new BadRequestException('Missing forum SSO payload');
    }
    if (!verifyDiscoursePayload(params.sso, params.sig, this.ssoSecret)) {
      throw new UnauthorizedException('Invalid forum SSO signature');
    }

    const payload = decodeDiscoursePayload(params.sso);
    const nonce = payload.nonce;
    if (!nonce) {
      throw new BadRequestException('Missing forum SSO nonce');
    }

    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.forumSsoTicket.findUnique({
        where: { ticket: nonce },
        include: { user: true, forumAccount: true },
      });

      if (!ticket) {
        throw new NotFoundException('Forum SSO ticket not found');
      }
      if (ticket.status !== ForumSsoTicketStatus.issued) {
        throw new BadRequestException('Forum SSO ticket already consumed');
      }
      if (new Date() > ticket.expiresAt) {
        await tx.forumSsoTicket.update({
          where: { id: ticket.id },
          data: { status: ForumSsoTicketStatus.expired },
        });
        throw new BadRequestException('Forum SSO ticket expired');
      }

      const account = await tx.forumAccount.update({
        where: { id: ticket.forumAccountId },
        data: {
          forumUserId: payload.external_id || ticket.userId,
          forumUsername: payload.username || ticket.user.username,
          forumEmail: payload.email || ticket.user.email,
          externalUid: payload.external_id || ticket.userId,
          syncStatus: ForumAccountSyncStatus.active,
          mappingSource: payload.external_id ? 'discourse_sso_callback' : 'local_protocol_callback',
          lastLoginAt: new Date(),
          lastSyncedAt: new Date(),
          meta: {
            name: payload.name || null,
            admin: payload.admin || null,
            moderator: payload.moderator || null,
          },
        },
      });

      await tx.forumSsoTicket.update({
        where: { id: ticket.id },
        data: {
          status: ForumSsoTicketStatus.consumed,
          consumedAt: new Date(),
        },
      });

      return {
        ok: true,
        provider: this.provider,
        redirectUrl: ticket.redirectUrl || this.forumEntryPath,
        account: this.publicForumAccount(account),
      };
    });
  }

  async getUserForumAccount(userId: string) {
    const account = await this.prisma.forumAccount.findUnique({
      where: {
        userId_forumProvider: {
          userId,
          forumProvider: this.provider,
        },
      },
    });

    return {
      provider: this.provider,
      forumOrigin: this.forumOrigin,
      forumEntryUrl: this.absoluteForumUrl(this.forumEntryPath),
      account: account ? this.publicForumAccount(account) : null,
      connected: Boolean(account && account.syncStatus !== ForumAccountSyncStatus.disabled),
      ssoStartUrl: '/api/forum/sso/start',
    };
  }

  private async getOrCreateForumAccount(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    return this.prisma.forumAccount.upsert({
      where: {
        userId_forumProvider: {
          userId,
          forumProvider: this.provider,
        },
      },
      update: {
        forumUsername: user.username,
        forumEmail: user.email,
      },
      create: {
        userId,
        forumProvider: this.provider,
        forumUserId: user.id,
        forumUsername: user.username,
        forumEmail: user.email,
        externalUid: user.id,
        mappingSource: 'local_sso_start',
      },
    });
  }

  private publicForumAccount(account: {
    id: string;
    forumProvider: string;
    forumUserId: string;
    forumUsername: string;
    forumEmail: string | null;
    externalUid: string;
    syncStatus: ForumAccountSyncStatus;
    mappingSource: string;
    lastSyncedAt: Date | null;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: account.id,
      forumProvider: account.forumProvider,
      forumUserId: account.forumUserId,
      forumUsername: account.forumUsername,
      forumEmail: account.forumEmail,
      externalUid: account.externalUid,
      syncStatus: account.syncStatus,
      mappingSource: account.mappingSource,
      lastSyncedAt: account.lastSyncedAt,
      lastLoginAt: account.lastLoginAt,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }

  private absoluteForumUrl(path: string) {
    return new URL(path || '/', this.forumOrigin).toString();
  }

  private requestUserAgent(request?: Request) {
    const userAgent = request?.headers['user-agent'];
    return Array.isArray(userAgent) ? userAgent[0] : userAgent || null;
  }

  private get provider() {
    return this.config.get<string>('FORUM_PROVIDER', 'discourse');
  }

  private get forumOrigin() {
    return this.config.get<string>('FORUM_ORIGIN', 'https://forum.example.com');
  }

  private get forumEntryPath() {
    return this.config.get<string>('FORUM_ENTRY_PATH', '/');
  }

  private get callbackUrl() {
    return this.config.get<string>('FORUM_SSO_RETURN_URL', 'http://127.0.0.1:8080/api/forum/sso/callback');
  }

  private get ssoSecret() {
    return this.config.get<string>('FORUM_SSO_SECRET', 'local-dev-forum-sso-secret');
  }
}
