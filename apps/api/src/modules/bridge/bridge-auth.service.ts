import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ForumAccountSyncStatus, Prisma, UserStatus } from '@prisma/client';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import {
  decodeDiscoursePayload,
  encodeDiscoursePayload,
  signDiscoursePayload,
  verifyDiscoursePayload,
} from '../../security/discourse-sso';
import { issueAuthToken, verifyAuthToken } from '../../security/auth-token';
import { BindingService } from '../binding/binding.service';
import { bindingTokenFromReturnTo, safeBridgeReturnTo } from './return-to';

const SSO_STATE_TTL_SECONDS = 5 * 60;
const BRIDGE_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

type SignedState = {
  nonce: string;
  purpose: 'bridge_login' | 'binding_confirm';
  bindingSessionId: string | null;
  serverId: string | null;
  returnTo: string;
  exp: number;
};

export type BridgeCurrentUser = {
  id: string;
  username: string;
  discourseUserId: string;
  discourseUsername: string;
  discourseEmail: string | null;
  localUserId: string | null;
};

@Injectable()
export class BridgeAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly bindingService: BindingService,
  ) {}

  async createDiscourseLoginRedirect(response: Response, returnTo?: string) {
    const safeReturnTo = safeBridgeReturnTo(returnTo, this.bridgePublicOrigin);
    const bindingToken = bindingTokenFromReturnTo(safeReturnTo, this.bridgePublicOrigin);
    const bindingContext = bindingToken
      ? await this.bindingService.beginDiscourseAuthentication(bindingToken)
      : null;
    const state: SignedState = {
      nonce: bindingContext?.nonce || randomBytes(24).toString('hex'),
      purpose: bindingContext ? 'binding_confirm' : 'bridge_login',
      bindingSessionId: bindingContext?.sessionId || null,
      serverId: bindingContext?.serverId || null,
      returnTo: safeReturnTo,
      exp: bindingContext
        ? Math.min(
          Math.floor(bindingContext.expiresAt.getTime() / 1000),
          Math.floor(Date.now() / 1000) + SSO_STATE_TTL_SECONDS,
        )
        : Math.floor(Date.now() / 1000) + SSO_STATE_TTL_SECONDS,
    };

    response.cookie(this.ssoStateCookieName, this.signState(state), {
      ...this.cookieOptions(),
      maxAge: SSO_STATE_TTL_SECONDS * 1000,
    });

    const payload = encodeDiscoursePayload({
      nonce: state.nonce,
      return_sso_url: this.discourseCallbackUrl,
    });
    const url = new URL('/session/sso_provider', this.forumOrigin);
    url.searchParams.set('sso', payload);
    url.searchParams.set('sig', signDiscoursePayload(payload, this.ssoSecret));
    return url.toString();
  }

  async consumeDiscourseCallback(
    request: Request,
    response: Response,
    params: { sso?: string; sig?: string },
  ) {
    if (!params.sso || !params.sig) {
      throw new BadRequestException('Missing Discourse SSO payload');
    }
    if (!verifyDiscoursePayload(params.sso, params.sig, this.ssoSecret)) {
      throw new UnauthorizedException('Invalid Discourse SSO signature');
    }

    const state = this.readStateCookie(request);
    const payload = decodeDiscoursePayload(params.sso);
    if (!payload.nonce || payload.nonce !== state.nonce) {
      throw new UnauthorizedException('Discourse SSO nonce mismatch');
    }

    const externalId = this.requiredPayloadValue(payload, 'external_id');
    const username = this.requiredPayloadValue(payload, 'username');
    const email = payload.email?.trim().toLowerCase() || `discourse-${externalId}@forum.local`;
    const user = await this.upsertDiscourseIdentity({
      externalId,
      username,
      email,
      name: payload.name || username,
      admin: payload.admin || null,
      moderator: payload.moderator || null,
    });
    const bindingToken = bindingTokenFromReturnTo(state.returnTo, this.bridgePublicOrigin);
    if (bindingToken) {
      if (state.purpose !== 'binding_confirm' || !state.bindingSessionId || !state.serverId) {
        throw new UnauthorizedException('Invalid binding SSO state context');
      }
      await this.bindingService.consumeDiscourseAuthentication({
        nonce: state.nonce,
        purpose: state.purpose,
        sessionId: state.bindingSessionId,
        serverId: state.serverId,
      }, user);
    } else if (state.purpose !== 'bridge_login' || state.bindingSessionId || state.serverId) {
      throw new UnauthorizedException('Invalid bridge SSO state context');
    }

    response.clearCookie(this.ssoStateCookieName, this.cookieOptions());
    response.cookie(
      this.sessionCookieName,
      issueAuthToken({ sub: user.discourseUserId, username: user.discourseUsername }, this.appSecret, BRIDGE_SESSION_TTL_SECONDS),
      {
        ...this.cookieOptions(),
        maxAge: BRIDGE_SESSION_TTL_SECONDS * 1000,
      },
    );

    return {
      returnTo: state.returnTo,
      user,
    };
  }

  async currentUser(request: Request): Promise<BridgeCurrentUser | null> {
    const token = this.readCookie(request, this.sessionCookieName);
    if (!token) {
      return null;
    }

    const payload = verifyAuthToken(token, this.appSecret);
    if (!payload) {
      return null;
    }

    const account = await this.prisma.forumAccount.findUnique({
      where: {
        forumProvider_externalUid: {
          forumProvider: this.provider,
          externalUid: payload.sub,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!account) {
      return this.legacyCurrentUserLookup(payload);
    }

    if (account.syncStatus === ForumAccountSyncStatus.disabled || account.user.status !== UserStatus.active) {
      return null;
    }

    return {
      id: account.externalUid,
      username: account.forumUsername || payload.username,
      discourseUserId: account.externalUid,
      discourseUsername: account.forumUsername || payload.username,
      discourseEmail: account.forumEmail,
      localUserId: account.userId,
    };
  }

  private async upsertDiscourseIdentity(params: {
    externalId: string;
    username: string;
    email: string;
    name: string;
    admin: string | null;
    moderator: string | null;
  }): Promise<BridgeCurrentUser> {
    return this.prisma.$transaction(async (tx) => {
      const existingAccount = await tx.forumAccount.findUnique({
        where: {
          forumProvider_externalUid: {
            forumProvider: this.provider,
            externalUid: params.externalId,
          },
        },
        include: { user: true },
      });

      if (existingAccount) {
        const user = await tx.user.update({
          where: { id: existingAccount.userId },
          data: {
            username: existingAccount.user.username,
            lastLoginAt: new Date(),
          },
        });

        const account = await tx.forumAccount.update({
          where: { id: existingAccount.id },
          data: {
            forumUserId: params.externalId,
            forumUsername: params.username,
            forumEmail: params.email,
            externalUid: params.externalId,
            syncStatus: ForumAccountSyncStatus.active,
            mappingSource: 'discourse_sso_provider',
            lastLoginAt: new Date(),
            lastSyncedAt: new Date(),
            meta: {
              name: params.name,
              admin: params.admin,
              moderator: params.moderator,
            },
          },
        });

        return this.currentUserFromAccount(account, user.id);
      }

      const emailUser = params.email.endsWith('@forum.local')
        ? null
        : await tx.user.findUnique({ where: { email: params.email } });
      const user = emailUser
        ? await tx.user.update({
          where: { id: emailUser.id },
          data: { lastLoginAt: new Date() },
        })
        : await tx.user.create({
          data: {
            username: await this.allocateUsername(tx, params.username),
            email: await this.allocateEmail(tx, params.email),
            source: 'discourse_sso_provider',
            lastLoginAt: new Date(),
          },
        });

      const existingForUser = await tx.forumAccount.findUnique({
        where: {
          userId_forumProvider: {
            userId: user.id,
            forumProvider: this.provider,
          },
        },
      });

      if (existingForUser && existingForUser.externalUid !== params.externalId) {
        throw new BadRequestException('Local user is already linked to another Discourse account');
      }

      const account = await tx.forumAccount.upsert({
        where: {
          forumProvider_externalUid: {
            forumProvider: this.provider,
            externalUid: params.externalId,
          },
        },
        update: {
          userId: user.id,
          forumUserId: params.externalId,
          forumUsername: params.username,
          forumEmail: params.email,
          externalUid: params.externalId,
          syncStatus: ForumAccountSyncStatus.active,
          mappingSource: 'discourse_sso_provider',
          lastLoginAt: new Date(),
          lastSyncedAt: new Date(),
          meta: {
            name: params.name,
            admin: params.admin,
            moderator: params.moderator,
          },
        },
        create: {
          userId: user.id,
          forumProvider: this.provider,
          forumUserId: params.externalId,
          forumUsername: params.username,
          forumEmail: params.email,
          externalUid: params.externalId,
          syncStatus: ForumAccountSyncStatus.active,
          mappingSource: 'discourse_sso_provider',
          lastLoginAt: new Date(),
          lastSyncedAt: new Date(),
          meta: {
            name: params.name,
            admin: params.admin,
            moderator: params.moderator,
          },
        },
      });

      return this.currentUserFromAccount(account, user.id);
    });
  }

  private currentUserFromAccount(account: {
    externalUid: string;
    forumUsername: string;
    forumEmail: string | null;
    userId: string;
  }, localUserId?: string): BridgeCurrentUser {
    return {
      id: account.externalUid,
      username: account.forumUsername,
      discourseUserId: account.externalUid,
      discourseUsername: account.forumUsername,
      discourseEmail: account.forumEmail,
      localUserId: localUserId || account.userId,
    };
  }

  private async legacyCurrentUserLookup(payload: { sub: string; username: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        username: true,
        status: true,
        forumAccounts: {
          where: { forumProvider: this.provider },
          take: 1,
        },
      },
    });

    if (!user || user.status !== UserStatus.active || !user.forumAccounts[0]?.externalUid) {
      return null;
    }

    return {
      id: user.forumAccounts[0].externalUid,
      username: user.forumAccounts[0].forumUsername || user.username,
      discourseUserId: user.forumAccounts[0].externalUid,
      discourseUsername: user.forumAccounts[0].forumUsername || user.username,
      discourseEmail: user.forumAccounts[0].forumEmail,
      localUserId: user.id,
    };
  }

  private async allocateUsername(tx: Prisma.TransactionClient, value: string) {
    const base = this.sanitizeUsername(value);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const suffix = attempt === 0 ? '' : `_${attempt}`;
      const candidate = `${base}${suffix}`.slice(0, 32);
      const existing = await tx.user.findUnique({ where: { username: candidate } });
      if (!existing) {
        return candidate;
      }
    }

    return `dc_${randomBytes(8).toString('hex')}`.slice(0, 32);
  }

  private async allocateEmail(tx: Prisma.TransactionClient, value: string) {
    const existing = await tx.user.findUnique({ where: { email: value } });
    if (!existing) {
      return value;
    }

    const [local, domain] = value.split('@');
    return `${local}+dc-${randomBytes(4).toString('hex')}@${domain || 'forum.local'}`;
  }

  private sanitizeUsername(value: string) {
    const sanitized = value.trim().replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').slice(0, 32);
    return sanitized || `dc_${randomBytes(6).toString('hex')}`;
  }

  private requiredPayloadValue(payload: Record<string, string>, key: string) {
    const value = payload[key]?.trim();
    if (!value) {
      throw new BadRequestException(`Missing Discourse SSO field: ${key}`);
    }
    return value;
  }

  private readStateCookie(request: Request) {
    const signed = this.readCookie(request, this.ssoStateCookieName);
    if (!signed) {
      throw new UnauthorizedException('Missing Discourse SSO state');
    }

    const state = this.verifyState(signed);
    if (!state || state.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Invalid Discourse SSO state');
    }
    return state;
  }

  private signState(state: SignedState) {
    const payload = Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  private verifyState(value: string): SignedState | null {
    const [payload, signature] = value.split('.');
    if (!payload || !signature) {
      return null;
    }

    const expected = this.sign(payload);
    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== signatureBuffer.length || !timingSafeEqual(expectedBuffer, signatureBuffer)) {
      return null;
    }

    try {
      const state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<SignedState>;
      if (
        typeof state.nonce !== 'string'
        || (state.purpose !== 'bridge_login' && state.purpose !== 'binding_confirm')
        || (state.bindingSessionId !== null && typeof state.bindingSessionId !== 'string')
        || (state.serverId !== null && typeof state.serverId !== 'string')
        || typeof state.returnTo !== 'string'
        || typeof state.exp !== 'number'
      ) {
        return null;
      }
      return state as SignedState;
    } catch {
      return null;
    }
  }

  private sign(value: string) {
    return createHmac('sha256', this.appSecret).update(value).digest('base64url');
  }

  private readCookie(request: Request, name: string) {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) {
      return null;
    }

    const cookies = cookieHeader.split(';').map((entry) => entry.trim());
    const prefix = `${name}=`;
    const match = cookies.find((entry) => entry.startsWith(prefix));
    return match ? decodeURIComponent(match.slice(prefix.length)) : null;
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.secureCookies,
      path: '/',
    };
  }

  private get discourseCallbackUrl() {
    return new URL('/api/auth/discourse/callback', this.bridgePublicOrigin).toString();
  }

  private get bridgePublicOrigin() {
    return this.config.get<string>('BRIDGE_PUBLIC_ORIGIN')
      || this.config.get<string>('PUBLIC_ORIGIN')
      || this.config.get<string>('APP_URL')
      || 'http://localhost:8080';
  }

  private get provider() {
    return this.config.get<string>('FORUM_PROVIDER', 'discourse');
  }

  private get forumOrigin() {
    return this.config.get<string>('FORUM_ORIGIN', 'https://forum.example.com');
  }

  private get ssoSecret() {
    return this.config.get<string>('DISCOURSE_PROVIDER_SECRET')
      || this.config.get<string>('FORUM_SSO_SECRET', 'local-dev-forum-sso-secret');
  }

  private get appSecret() {
    return this.config.get<string>('APP_SECRET', 'replace-with-a-long-random-secret');
  }

  private get secureCookies() {
    return this.bridgePublicOrigin.startsWith('https://') || this.config.get<string>('NODE_ENV') === 'production';
  }

  private get sessionCookieName() {
    return this.config.get<string>('BRIDGE_SESSION_COOKIE_NAME', 'gm_bridge_session');
  }

  private get ssoStateCookieName() {
    return this.config.get<string>('BRIDGE_SSO_STATE_COOKIE_NAME', 'gm_bridge_sso_state');
  }
}
