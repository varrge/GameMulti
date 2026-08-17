import { BadRequestException } from '@nestjs/common';

export function assertBindingAuthenticationContext(params: {
  requireDiscourseContext: boolean;
  authenticatedAt?: Date | null;
  authenticatedDiscourseUserId?: string | null;
  authenticatedServerId?: string | null;
  discourseUserId: string;
  serverId: string;
}) {
  if (params.requireDiscourseContext && (!params.authenticatedAt || !params.authenticatedDiscourseUserId)) {
    throw new BadRequestException('Binding session requires Discourse authentication');
  }
  if (
    params.authenticatedDiscourseUserId
    && params.authenticatedDiscourseUserId !== params.discourseUserId
  ) {
    throw new BadRequestException('Binding session was authenticated by another Discourse user');
  }
  if (params.authenticatedServerId && params.authenticatedServerId !== params.serverId) {
    throw new BadRequestException('Binding session server context mismatch');
  }
}
