"use client";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "/api").replace(/\/$/, "");
const AUTH_TOKEN_KEY = "gamemulti.auth.token";
const AUTH_USER_KEY = "gamemulti.auth.user";

export type ApiUser = {
  id: string;
  username: string;
  email: string;
  status: string;
  createdAt: string;
  lastLoginAt?: string | null;
};

export type AuthResult = {
  user: ApiUser;
  token: string;
};

export type BindingSession = {
  id: string;
  game: { code: string; name: string };
  server: { serverCode: string; serverName: string };
  platform: string;
  gameUserId: string;
  displayName: string | null;
  bindMode: string;
  status: string;
  expiresAt: string;
  expired: boolean;
};

export type GameBinding = {
  id: string;
  bindStatus: string;
  bindSource: string;
  verifiedAt: string | null;
  createdAt: string;
  gameAccount: {
    gameUserId: string;
    displayName: string | null;
    platform: string;
    game: { code: string; name: string };
  };
  server: { serverCode: string; serverName: string };
};

type ApiErrorBody = {
  message?: string | string[];
  error?: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: ApiErrorBody,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getAuthToken();

  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const message = Array.isArray(body?.message)
      ? body.message.join("; ")
      : body?.message || body?.error || `Request failed with ${response.status}`;
    throw new ApiError(message, response.status, body);
  }

  return body as T;
}

export function getAuthToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function getStoredUser(): ApiUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as ApiUser;
  } catch {
    return null;
  }
}

export function storeAuth(result: AuthResult) {
  window.localStorage.setItem(AUTH_TOKEN_KEY, result.token);
  window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(result.user));
}

export function clearAuth() {
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(AUTH_USER_KEY);
}

export const api = {
  validateInvitation(code: string) {
    return request<{ valid: boolean; codeStatus: string; remainingUses?: number; expiresAt?: string | null; message?: string }>(
      "/invitations/validate",
      {
        method: "POST",
        body: JSON.stringify({ code }),
      },
    );
  },

  register(params: { username: string; email: string; password: string; inviteCode: string }) {
    return request<AuthResult>("/auth/register", {
      method: "POST",
      body: JSON.stringify(params),
    });
  },

  login(params: { login: string; password: string }) {
    return request<AuthResult>("/auth/login", {
      method: "POST",
      body: JSON.stringify(params),
    });
  },

  me() {
    return request<{ user: ApiUser; gameBindings: GameBinding[] }>("/me");
  },

  findBindingByToken(token: string) {
    return request<BindingSession>(`/bindings/session/by-token?token=${encodeURIComponent(token)}`);
  },

  findBindingByPairCode(pairCode: string) {
    return request<BindingSession>("/bindings/session/by-pair-code", {
      method: "POST",
      body: JSON.stringify({ pairCode }),
    });
  },

  confirmBinding(sessionId: string) {
    return request<GameBinding>("/bindings/confirm", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    });
  },

  listGameBindings() {
    return request<GameBinding[]>("/me/game-bindings");
  },
};
