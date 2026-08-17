const BINDING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function safeBridgeReturnTo(value: string | undefined, bridgePublicOrigin: string) {
  if (!value || value.length > 512) {
    return '/';
  }

  try {
    const origin = new URL(bridgePublicOrigin);
    const url = new URL(value, origin);
    if (url.origin !== origin.origin || url.username || url.password || url.hash) {
      return '/';
    }
    if (url.pathname === '/bind/account') {
      return '/bind/account';
    }
    if (url.pathname === '/bind/confirm') {
      const token = url.searchParams.get('token');
      if (token && BINDING_TOKEN_PATTERN.test(token)) {
        return `/bind/confirm?token=${encodeURIComponent(token)}`;
      }
    }
  } catch {
    return '/';
  }

  return '/';
}

export function bindingTokenFromReturnTo(returnTo: string, bridgePublicOrigin: string) {
  const canonical = safeBridgeReturnTo(returnTo, bridgePublicOrigin);
  if (canonical === '/') {
    return null;
  }
  const url = new URL(canonical, bridgePublicOrigin);
  return url.pathname === '/bind/confirm' ? url.searchParams.get('token') : null;
}
