import assert from 'node:assert/strict';
import test from 'node:test';
import { BindingSessionStatus, UserGameBindingStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { BINDING_AUTH_PURPOSE, BindingService } from './binding.service';

const identity = {
  discourseUserId: 'user-42',
  discourseUsername: 'player',
  discourseEmail: 'player@example.com',
  localUserId: 'local-42',
};

function serviceWithTransaction(tx: Record<string, unknown>) {
  const prisma = {
    $transaction: async (operation: (client: Record<string, unknown>) => unknown) => operation(tx),
  } as unknown as PrismaService;
  const config = { get: (_key: string, fallback?: string) => fallback } as ConfigService;
  return new BindingService(config, prisma);
}

function authSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'binding-1',
    token: 'token-1',
    status: BindingSessionStatus.pending,
    serverId: 'server-1',
    authPurpose: BINDING_AUTH_PURPOSE,
    authBindingSessionId: 'binding-1',
    authServerId: 'server-1',
    authExpiresAt: new Date(Date.now() + 60_000),
    expiresAt: new Date(Date.now() + 120_000),
    authenticatedAt: null,
    ...overrides,
  };
}

const authContext = {
  nonce: 'single-use-nonce',
  purpose: BINDING_AUTH_PURPOSE,
  sessionId: 'binding-1',
  serverId: 'server-1',
};

test('consumes matching binding authentication context exactly once', async () => {
  let consumed = false;
  const updates: Array<Record<string, unknown>> = [];
  const tx = {
    bindingSession: {
      findUnique: async () => consumed ? null : authSession(),
      updateMany: async (args: Record<string, unknown>) => {
        consumed = true;
        updates.push(args);
        return { count: 1 };
      },
    },
  };
  const service = serviceWithTransaction(tx);

  assert.deepEqual(await service.consumeDiscourseAuthentication(authContext, identity), {
    sessionId: 'binding-1',
    token: 'token-1',
    serverId: 'server-1',
  });
  assert.equal((updates[0].where as Record<string, unknown>).authBindingSessionId, 'binding-1');
  assert.equal((updates[0].where as Record<string, unknown>).authServerId, 'server-1');
  await assert.rejects(service.consumeDiscourseAuthentication(authContext, identity), /context not found/);
});

test('rejects tampered purpose, cross-session, cross-server, and expired contexts without consuming them', async () => {
  for (const [name, context, session] of [
    ['purpose', { ...authContext, purpose: 'bridge_login' }, authSession()],
    ['session', { ...authContext, sessionId: 'binding-2' }, authSession()],
    ['server', { ...authContext, serverId: 'server-2' }, authSession()],
    ['expiry', authContext, authSession({ authExpiresAt: new Date(Date.now() - 1_000) })],
  ] as const) {
    const updates: Array<Record<string, unknown>> = [];
    const service = serviceWithTransaction({
      bindingSession: {
        findUnique: async () => session,
        updateMany: async (args: Record<string, unknown>) => {
          updates.push(args);
          return { count: 1 };
        },
      },
    });
    await assert.rejects(service.consumeDiscourseAuthentication(context, identity), name === 'expiry' ? /expired/ : /mismatch/);
    if (name === 'expiry') {
      assert.equal((updates[0].data as Record<string, unknown>).status, BindingSessionStatus.expired);
      assert.equal((updates[0].data as Record<string, unknown>).authenticatedAt, undefined);
    } else {
      assert.equal(updates.length, 0, `${name} context must not be consumed`);
    }
  }
});

function confirmationSession(overrides: Record<string, unknown> = {}) {
  return {
    ...authSession({
      gameId: 'game-1',
      pluginClientId: 'plugin-1',
      gameUserId: 'Player-One',
      platform: 'java',
      displayName: 'Player One',
      bindMode: 'link',
      authenticatedAt: new Date(),
      authenticatedDiscourseUserId: 'user-42',
      authenticatedServerId: 'server-1',
      game: { code: 'minecraft', name: 'Minecraft' },
      server: { serverCode: 'survival', serverName: 'Survival' },
      pluginClient: { id: 'plugin-1' },
    }),
    ...overrides,
  };
}

test('confirms a matching authenticated session and records bound ownership', async () => {
  const updates: Array<Record<string, unknown>> = [];
  const binding = {
    id: 'binding-result',
    gameAccount: { id: 'account-1', game: { code: 'minecraft' } },
    server: { id: 'server-1' },
  };
  const service = serviceWithTransaction({
    bindingSession: {
      findUnique: async () => confirmationSession(),
      update: async (args: Record<string, unknown>) => {
        updates.push(args);
        return args;
      },
    },
    gameAccount: { upsert: async () => ({ id: 'account-1' }) },
    userGameBinding: {
      findFirst: async () => null,
      upsert: async () => binding,
    },
  });

  assert.equal(await service.confirmBindingForDiscourseUser(identity, 'binding-1'), binding);
  assert.equal((updates[0].data as Record<string, unknown>).status, BindingSessionStatus.confirmed);
  assert.equal((updates[0].data as Record<string, unknown>).usedByDiscourseUserId, 'user-42');
});

test('requires the consumed Discourse context for the authenticated API confirmation path', async () => {
  const service = serviceWithTransaction({
    bindingSession: {
      findUnique: async () => confirmationSession({ authenticatedAt: null }),
    },
  });
  (service as unknown as { resolveLocalUserDiscourseIdentity: () => Promise<typeof identity> })
    .resolveLocalUserDiscourseIdentity = async () => identity;

  await assert.rejects(service.confirmBinding('local-42', 'binding-1'), /requires Discourse authentication/);
});

test('rejects cross-user confirmation before writing a binding', async () => {
  let accountWritten = false;
  const service = serviceWithTransaction({
    bindingSession: { findUnique: async () => confirmationSession({ authenticatedDiscourseUserId: 'user-other' }) },
    gameAccount: { upsert: async () => { accountWritten = true; } },
  });

  await assert.rejects(service.confirmBindingForDiscourseUser(identity, 'binding-1'), /another Discourse user/);
  assert.equal(accountWritten, false);
});

test('persists wall-clock expiry before returning an expiry error', async () => {
  const sessionUpdates: Array<Record<string, unknown>> = [];
  const service = serviceWithTransaction({
    bindingSession: {
      findUnique: async () => confirmationSession({ expiresAt: new Date(Date.now() - 1_000) }),
      update: async (args: Record<string, unknown>) => {
        sessionUpdates.push(args);
        return args;
      },
    },
  });

  await assert.rejects(service.confirmBindingForDiscourseUser(identity, 'binding-1'), /expired/);
  assert.equal((sessionUpdates[0].data as Record<string, unknown>).status, BindingSessionStatus.expired);
});

test('persists conflict status before returning an ownership conflict error', async () => {
  const sessionUpdates: Array<Record<string, unknown>> = [];
  const service = serviceWithTransaction({
    bindingSession: {
      findUnique: async () => confirmationSession(),
      update: async (args: Record<string, unknown>) => {
        sessionUpdates.push(args);
        return args;
      },
    },
    gameAccount: { upsert: async () => ({ id: 'account-1' }) },
    userGameBinding: {
      findFirst: async () => ({
        id: 'other-binding',
        userId: null,
        discourseUserId: 'user-other',
        bindStatus: UserGameBindingStatus.active,
      }),
    },
  });

  await assert.rejects(service.confirmBindingForDiscourseUser(identity, 'binding-1'), /already bound/);
  assert.equal((sessionUpdates[0].data as Record<string, unknown>).status, BindingSessionStatus.conflict);
  assert.equal((sessionUpdates[0].data as Record<string, unknown>).confirmedGameAccountId, 'account-1');
});
