"use client";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "/api").replace(/\/$/, "");
const AUTH_TOKEN_KEY = "gamemulti.auth.token";
const AUTH_USER_KEY = "gamemulti.auth.user";
const ADMIN_KEY_STORAGE_KEY = "gamemulti.admin.key";

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

export type AdminGameServer = {
  id: string;
  serverCode: string;
  serverName: string;
  status: string;
  region: string | null;
  game: { code: string; name: string; status: string };
  pluginClients: Array<{
    id: string;
    clientKey: string;
    pluginVersion: string | null;
    protocolVersion: string | null;
    lastHeartbeatAt: string | null;
    status: string;
    updatedAt: string;
  }>;
  latestHeartbeat: {
    statusId: string;
    healthy: boolean;
    onlineCount: number;
    queueDepth: number;
    sentAt: string;
    createdAt: string;
  } | null;
  counts: {
    bindingSessions: number;
    userBindings: number;
    pluginEvents: number;
    heartbeats: number;
  };
};

export type AdminPluginEvent = {
  id: string;
  eventId: string;
  eventType: string;
  playerUuid: string;
  displayName: string | null;
  occurredAt: string;
  createdAt: string;
  metadata: Record<string, unknown> | null;
  server: {
    serverCode: string;
    serverName: string;
    game: { code: string; name: string };
  };
  pluginClient: {
    id: string;
    clientKey: string;
  };
};

export type ForumAccount = {
  id: string;
  forumProvider: string;
  forumUserId: string;
  forumUsername: string;
  forumEmail: string | null;
  externalUid: string;
  syncStatus: string;
  mappingSource: string;
  lastSyncedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ForumAccountStatus = {
  provider: string;
  forumOrigin: string;
  forumEntryUrl: string;
  account: ForumAccount | null;
  connected: boolean;
  ssoStartUrl: string;
};

export type ForumSsoStart = {
  provider: string;
  forumSsoUrl: string;
  ticket: string;
  expiresIn: number;
  account: ForumAccount;
  payload: string;
  sig: string;
};

export type AdminForumSummary = {
  counts: {
    accounts: number;
    activeAccounts: number;
    failedAccounts: number;
  };
  recentAccounts: Array<ForumAccount & {
    user: {
      id: string;
      username: string;
      email: string;
      status: string;
    };
  }>;
  recentTickets: Array<{
    id: string;
    forumProvider: string;
    ticket: string;
    status: string;
    redirectUrl: string | null;
    expiresAt: string;
    consumedAt: string | null;
    createdAt: string;
    user: {
      id: string;
      username: string;
      email: string;
    };
    forumAccount: ForumAccount;
  }>;
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

async function adminRequest<T>(path: string, adminKey: string): Promise<T> {
  return request<T>(path, {
    headers: {
      "X-GM-Admin-Key": adminKey,
    },
  });
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

export function getStoredAdminKey() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(ADMIN_KEY_STORAGE_KEY) || "";
}

export function storeAdminKey(value: string) {
  window.localStorage.setItem(ADMIN_KEY_STORAGE_KEY, value);
}

export function clearAdminKey() {
  window.localStorage.removeItem(ADMIN_KEY_STORAGE_KEY);
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

  getForumAccount() {
    return request<ForumAccountStatus>("/me/forum-account");
  },

  getForumEntry() {
    return request<ForumAccountStatus>("/forum/entry");
  },

  startForumSso(returnPath = "/") {
    return request<ForumSsoStart>(`/forum/sso/start?returnPath=${encodeURIComponent(returnPath)}`);
  },

  adminListGameServers(adminKey: string) {
    return adminRequest<AdminGameServer[]>("/admin/game-servers", adminKey);
  },

  adminListPluginEvents(adminKey: string, filters: { serverCode?: string; eventType?: string; player?: string } = {}) {
    const query = new URLSearchParams();
    if (filters.serverCode) query.set("serverCode", filters.serverCode);
    if (filters.eventType) query.set("eventType", filters.eventType);
    if (filters.player) query.set("player", filters.player);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return adminRequest<AdminPluginEvent[]>(`/admin/plugin-events${suffix}`, adminKey);
  },

  adminForumSummary(adminKey: string) {
    return adminRequest<AdminForumSummary>("/admin/forum/summary", adminKey);
  },
};
