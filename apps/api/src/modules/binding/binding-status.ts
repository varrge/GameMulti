import { BindingSessionStatus } from '@prisma/client';

export type UnifiedBindingStatus =
  | 'pending'
  | 'bound'
  | 'expired'
  | 'cancelled'
  | 'conflict'
  | 'revoked'
  | 'denied'
  | 'unavailable';

export type BindingNextAction =
  | 'authenticate_with_discourse'
  | 'confirm_binding'
  | 'enter_game_or_community'
  | 'return_to_source'
  | 'start_new_binding'
  | 'contact_operations_or_unbind'
  | 'rebind_or_view_reason'
  | 'view_authorization_requirements'
  | 'retry_later';

const terminalStatus: Record<Exclude<BindingSessionStatus, 'pending'>, {
  status: Exclude<UnifiedBindingStatus, 'pending'>;
  recoverable: boolean;
  nextAction: BindingNextAction;
}> = {
  confirmed: { status: 'bound', recoverable: false, nextAction: 'enter_game_or_community' },
  expired: { status: 'expired', recoverable: true, nextAction: 'start_new_binding' },
  cancelled: { status: 'cancelled', recoverable: true, nextAction: 'return_to_source' },
  conflict: { status: 'conflict', recoverable: true, nextAction: 'contact_operations_or_unbind' },
  revoked: { status: 'revoked', recoverable: true, nextAction: 'rebind_or_view_reason' },
  denied: { status: 'denied', recoverable: true, nextAction: 'view_authorization_requirements' },
  unavailable: { status: 'unavailable', recoverable: true, nextAction: 'retry_later' },
};

export function mapBindingStatus(params: {
  status: BindingSessionStatus;
  expiresAt: Date;
  authenticatedAt?: Date | null;
  now?: Date;
}) {
  if (params.status !== BindingSessionStatus.pending) {
    return terminalStatus[params.status];
  }
  if ((params.now || new Date()) > params.expiresAt) {
    return terminalStatus.expired;
  }
  return {
    status: 'pending' as const,
    recoverable: true,
    nextAction: params.authenticatedAt
      ? 'confirm_binding' as const
      : 'authenticate_with_discourse' as const,
  };
}
