import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { verifyAuthToken } from '../security/auth-token';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: { id: string; username: string };
    }>();
    const authorization = request.headers.authorization;
    const header = Array.isArray(authorization) ? authorization[0] : authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = header.slice('Bearer '.length).trim();
    const secret = this.config.get<string>('APP_SECRET', 'replace-with-a-long-random-secret');
    const payload = verifyAuthToken(token, secret);

    if (!payload) {
      throw new UnauthorizedException('Invalid bearer token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, status: true },
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('User is not active');
    }

    request.user = { id: user.id, username: user.username };
    return true;
  }
}
