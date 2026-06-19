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
