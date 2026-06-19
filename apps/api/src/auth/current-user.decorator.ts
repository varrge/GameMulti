import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type CurrentUserPayload = {
  id: string;
  username: string;
};

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): CurrentUserPayload | null => {
  const request = context.switchToHttp().getRequest<{ user?: CurrentUserPayload }>();
  return request.user ?? null;
});
