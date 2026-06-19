import { BadRequestException, Injectable } from '@nestjs/common';
import { InvitationCodeStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';

export type InvitationValidationResult = {
  valid: boolean;
  codeStatus: 'active' | 'not_found' | 'disabled' | 'expired' | 'exhausted';
  remainingUses?: number;
  expiresAt?: Date | null;
  message?: string;
};

@Injectable()
export class InviteService {
  constructor(private readonly prisma: PrismaService) {}

  normalizeCode(code: string) {
    return String(code || '').trim().toUpperCase();
  }

  async validateCode(code: string): Promise<InvitationValidationResult> {
    const normalized = this.normalizeCode(code);
    const invitation = await this.prisma.invitationCode.findUnique({
      where: { code: normalized },
    });

    if (!invitation) {
      return { valid: false, codeStatus: 'not_found', message: 'Invitation code not found' };
    }

    const now = new Date();
    if (invitation.status === InvitationCodeStatus.disabled) {
      return { valid: false, codeStatus: 'disabled', message: 'Invitation code disabled' };
    }
    if (invitation.expiresAt && now > invitation.expiresAt) {
      return { valid: false, codeStatus: 'expired', message: 'Invitation code expired' };
    }
    if (invitation.usedCount >= invitation.maxUses) {
      return { valid: false, codeStatus: 'exhausted', message: 'Invitation code exhausted' };
    }

    return {
      valid: true,
      codeStatus: 'active',
      remainingUses: invitation.maxUses - invitation.usedCount,
      expiresAt: invitation.expiresAt,
    };
  }

  async consumeCode(
    tx: Prisma.TransactionClient,
    params: {
      code: string;
      userId: string;
      usedIp?: string | null;
      usedUserAgent?: string | null;
    },
  ) {
    const normalized = this.normalizeCode(params.code);
    const invitation = await tx.invitationCode.findUnique({
      where: { code: normalized },
    });

    if (!invitation) {
      throw new BadRequestException('Invitation code not found');
    }

    const now = new Date();
    if (invitation.status !== InvitationCodeStatus.active) {
      throw new BadRequestException('Invitation code is not active');
    }
    if (invitation.expiresAt && now > invitation.expiresAt) {
      throw new BadRequestException('Invitation code expired');
    }
    if (invitation.usedCount >= invitation.maxUses) {
      throw new BadRequestException('Invitation code exhausted');
    }

    await tx.invitationCode.update({
      where: { id: invitation.id },
      data: { usedCount: { increment: 1 } },
    });

    await tx.invitationCodeUsage.create({
      data: {
        invitationCodeId: invitation.id,
        userId: params.userId,
        inviterUserId: invitation.ownerUserId,
        usedIp: params.usedIp,
        usedUserAgent: params.usedUserAgent,
      },
    });

    return invitation;
  }

  async batchCreate(params: {
    count: number;
    maxUses: number;
    createdBy: string;
    ownerUserId?: string;
    batchId?: string;
    remark?: string;
  }) {
    const batchId = params.batchId || `batch_${Date.now()}`;
    const created = [];

    for (let index = 0; index < params.count; index += 1) {
      const code = await this.createUniqueCode();
      created.push(
        await this.prisma.invitationCode.create({
          data: {
            code,
            createdBy: params.createdBy,
            ownerUserId: params.ownerUserId,
            batchId,
            maxUses: params.maxUses,
            remark: params.remark,
            status: InvitationCodeStatus.active,
          },
        }),
      );
    }

    return { batchId, invitations: created };
  }

  async listInvitations() {
    return this.prisma.invitationCode.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async listInvitationUsages(invitationId: string) {
    return this.prisma.invitationCodeUsage.findMany({
      where: { invitationCodeId: invitationId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            status: true,
            createdAt: true,
          },
        },
      },
      orderBy: { usedAt: 'desc' },
      take: 200,
    });
  }

  private async createUniqueCode() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = randomBytes(5).toString('base64url').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8);
      const existing = await this.prisma.invitationCode.findUnique({ where: { code } });
      if (!existing) {
        return code;
      }
    }

    throw new BadRequestException('Failed to allocate unique invitation code');
  }
}
