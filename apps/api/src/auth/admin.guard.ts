import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { verifyAuthToken } from '../security/auth-token';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      adminAuth?: { type: 'api_key' } | { type: 'user'; userId: string; username: string };
    }>();

    if (this.hasValidAdminApiKey(request.headers)) {
      request.adminAuth = { type: 'api_key' };
      return true;
    }

    const authorization = this.readHeader(request.headers, 'authorization');
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing admin credentials');
    }

    const token = authorization.slice('Bearer '.length).trim();
    const secret = this.config.get<string>('APP_SECRET', 'replace-with-a-long-random-secret');
    const payload = verifyAuthToken(token, secret);
    if (!payload) {
      throw new UnauthorizedException('Invalid bearer token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, status: true },
    });

    if (!user || user.status !== 'active' || !this.isAdminUser(user.id, user.username)) {
      throw new UnauthorizedException('User is not allowed to access admin endpoints');
    }

    request.adminAuth = { type: 'user', userId: user.id, username: user.username };
    return true;
  }

  private hasValidAdminApiKey(headers: Record<string, string | string[] | undefined>) {
    const expected = this.config.get<string>('ADMIN_API_KEY', '').trim();
    if (!expected) {
      return false;
    }

    const provided = this.readHeader(headers, 'x-gm-admin-key')?.trim();
    if (!provided) {
      return false;
    }

    return this.constantTimeEqual(provided, expected);
  }

  private isAdminUser(userId: string, username: string) {
    const adminUserIds = this.csvConfig('ADMIN_USER_IDS');
    const adminUsernames = this.csvConfig('ADMIN_USERNAMES').map((value) => value.toLowerCase());

    return adminUserIds.includes(userId) || adminUsernames.includes(username.toLowerCase());
  }

  private csvConfig(name: string) {
    return this.config
      .get<string>(name, '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  private readHeader(headers: Record<string, string | string[] | undefined>, name: string) {
    const value = headers[name] || headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }

  private constantTimeEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }
}
