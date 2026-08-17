export function requiresBindingAuthentication(params: {
  hasCurrentUser: boolean;
  nextAction: string;
}) {
  return !params.hasCurrentUser || params.nextAction === 'authenticate_with_discourse';
}
