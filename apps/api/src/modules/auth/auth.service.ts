import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthProvider } from '@prisma/client';
import { Request } from 'express';
import { InviteService } from '../invite/invite.service';
import { PrismaService } from '../../prisma/prisma.service';
import { issueAuthToken } from '../../security/auth-token';
import { hashPassword, verifyPassword } from '../../security/password';

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly inviteService: InviteService,
  ) {}

  async register(params: {
    username: string;
    email: string;
    password: string;
    inviteCode: string;
    request?: Request;
  }) {
    const username = params.username.trim();
    const email = params.email.trim().toLowerCase();
    const inviteCode = this.inviteService.normalizeCode(params.inviteCode);

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ username }, { email }],
      },
      select: { username: true, email: true },
    });

    if (existingUser?.username === username) {
      throw new ConflictException('Username already exists');
    }
    if (existingUser?.email === email) {
      throw new ConflictException('Email already exists');
    }

    const validation = await this.inviteService.validateCode(inviteCode);
    if (!validation.valid) {
      throw new BadRequestException(validation.message || 'Invitation code is not usable');
    }

    const passwordHash = await hashPassword(params.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username,
          email,
          passwordHash,
          registerIp: this.getRequestIp(params.request),
          registerUserAgent: this.getRequestUserAgent(params.request),
        },
      });

      await tx.userAuthAccount.create({
        data: {
          userId: created.id,
          provider: AuthProvider.password,
          providerAccountId: email,
          passwordHash,
          email,
        },
      });

      const invitation = await this.inviteService.consumeCode(tx, {
        code: inviteCode,
        userId: created.id,
        usedIp: this.getRequestIp(params.request),
        usedUserAgent: this.getRequestUserAgent(params.request),
      });

      return tx.user.update({
        where: { id: created.id },
        data: {
          invitedByUserId: invitation.ownerUserId,
          invitationCodeId: invitation.id,
        },
      });
    });

    return {
      user: this.publicUser(user),
      token: this.issueUserToken(user.id, user.username),
    };
  }

  async login(params: { login: string; password: string }) {
    const login = params.login.trim();
    const normalizedEmail = login.toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: login }, { email: normalizedEmail }],
      },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await verifyPassword(params.password, user.passwordHash);
    if (!valid || user.status !== 'active') {
      throw new UnauthorizedException('Invalid credentials');
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      user: this.publicUser(updated),
      token: this.issueUserToken(updated.id, updated.username),
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        gameBindings: {
          include: {
            gameAccount: {
              include: { game: true },
            },
            server: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return {
      user: this.publicUser(user),
      gameBindings: user.gameBindings,
    };
  }

  private issueUserToken(userId: string, username: string) {
    const secret = this.config.get<string>('APP_SECRET', 'replace-with-a-long-random-secret');
    return issueAuthToken({ sub: userId, username }, secret);
  }

  private publicUser(user: { id: string; username: string; email: string; status: string; createdAt: Date; lastLoginAt?: Date | null }) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      status: user.status,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt ?? null,
    };
  }

  private getRequestIp(request?: Request) {
    return request?.ip || null;
  }

  private getRequestUserAgent(request?: Request) {
    const userAgent = request?.headers['user-agent'];
    return Array.isArray(userAgent) ? userAgent[0] : userAgent || null;
  }
}
