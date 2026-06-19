import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type AuthenticatedPluginClient = {
  id: string;
  clientKey: string;
  serverId: string;
  serverCode: string;
  gameId: string;
  gameCode: string;
};

export const PluginClient = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPluginClient | null => {
    const request = context.switchToHttp().getRequest<{ pluginClient?: AuthenticatedPluginClient }>();
    return request.pluginClient ?? null;
  },
);
