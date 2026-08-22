import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { BindingController } from './binding.controller';
import { BindingService } from './binding.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PLUGIN_ERROR_CODES, PluginApiError, PluginErrorBody } from '../../plugin/plugin-api-error';
import { PluginApiExceptionFilter } from '../../plugin/plugin-api-exception.filter';
import { PluginAuthGuard } from '../../plugin/plugin-auth.guard';
import { signPluginRequest } from '../../security/plugin-signature';

const pluginClient = {
  id: 'plugin-1',
  clientKey: 'client-1',
  serverId: 'server-1',
  serverCode: 'survival',
  gameId: 'game-1',
  gameCode: 'minecraft',
  protocolVersion: '2026-06-mvp',
};

const createParams = {
  requestId: 'request-123',
  serverCode: 'survival',
  gameCode: 'minecraft',
  platform: 'java',
  gameUserId: 'player-1',
  displayName: 'Player One',
  bindMode: 'bind_existing',
};

function config() {
  return { get: (_key: string, fallback?: string) => fallback } as ConfigService;
}

function filteredPluginResponse(exception: unknown, path = '/api/plugin/bindings/session') {
  let status: number | undefined;
  let body: PluginErrorBody | undefined;
  const response = {
    setHeader: () => response,
    status: (value: number) => {
      status = value;
      return response;
    },
    json: (value: PluginErrorBody) => {
      body = value;
      return response;
    },
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ path }),
      getResponse: () => response,
    }),
  };
  new PluginApiExceptionFilter().catch(exception, host as never);
  assert.ok(body);
  return { status, body, serialized: JSON.stringify(body) };
}

function assertPluginErrorBody(body: PluginErrorBody) {
  assert.equal(typeof body.code, 'string');
  assert.equal(typeof body.message, 'string');
  assert.equal(typeof body.retryable, 'boolean');
  assert.match(body.requestId, /^[0-9a-f-]{36}$/);
  assert.equal('clientSecret' in body, false);
  assert.equal('bindingToken' in body, false);
}

function pluginRequest(headers: Record<string, string>) {
  return {
    method: 'GET',
    url: '/api/plugin/bindings/session-1',
    headers,
  };
}

function guardWithClient(client: Record<string, unknown> | null) {
  const prisma = {
    serverPluginClient: { findUnique: async () => client },
  } as unknown as PrismaService;
  return new PluginAuthGuard(config(), prisma);
}

async function guardError(guard: PluginAuthGuard, request: Record<string, unknown>) {
  await assert.rejects(
    guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as never),
    (error: { getStatus: () => number; getResponse: () => { code: string } }) => error.getStatus() > 0,
  );
  try {
    await guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as never);
  } catch (error) {
    return error as { getStatus: () => number; getResponse: () => { code: string; serverTime?: number } };
  }
  throw new Error('expected plugin guard to reject');
}

test('plugin guard accepts a valid HMAC and rejects an invalid signature', async () => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = '01'.repeat(32);
  const secret = 'test-secret';
  const headers = {
    'x-gm-client-key': 'client-1',
    'x-gm-timestamp': timestamp,
    'x-gm-nonce': nonce,
    'x-gm-protocol-version': '2026-06-mvp',
    'x-gm-signature': signPluginRequest({ method: 'GET', path: '/api/plugin/bindings/session-1', timestamp, nonce, body: '' }, secret),
  };
  const client = {
    id: 'plugin-1', clientKey: 'client-1', status: 'active', expiresAt: null, protocolVersion: '2026-06-mvp',
    clientSecretHash: secret, serverId: 'server-1',
    server: { serverCode: 'survival', gameId: 'game-1', status: 'active', game: { code: 'minecraft', status: 'active' } },
  };
  const prisma = {
    serverPluginClient: { findUnique: async () => client, update: async () => client },
    pluginRequestNonce: { deleteMany: async () => ({ count: 0 }), create: async () => ({}) },
  } as unknown as PrismaService;
  const guard = new PluginAuthGuard(config(), prisma);
  const request = pluginRequest(headers);
  assert.equal(await guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as never), true);
  assert.equal((request as { pluginClient?: { id: string } }).pluginClient?.id, 'plugin-1');

  const invalid = await guardError(guardWithClient(client), pluginRequest({ ...headers, 'x-gm-signature': '00' }));
  assert.equal(invalid.getStatus(), 401);
  assert.equal(invalid.getResponse().code, 'AUTHENTICATION_FAILED');
});

test('plugin guard verifies the exact request bytes instead of reserializing JSON', async () => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = '02'.repeat(32);
  const secret = 'test-secret';
  const rawBody = Buffer.from('{ "displayName": "\\u0053teve", "onlineCount": 1 }');
  const client = {
    id: 'plugin-1', clientKey: 'client-1', status: 'active', expiresAt: null, protocolVersion: '2026-06-mvp',
    clientSecretHash: secret, serverId: 'server-1',
    server: { serverCode: 'survival', gameId: 'game-1', status: 'active', game: { code: 'minecraft', status: 'active' } },
  };
  const prisma = {
    serverPluginClient: { findUnique: async () => client, update: async () => client },
    pluginRequestNonce: { deleteMany: async () => ({ count: 0 }), create: async () => ({}) },
  } as unknown as PrismaService;
  const request = {
    method: 'POST',
    url: '/api/plugin/events',
    body: JSON.parse(rawBody.toString('utf8')),
    rawBody,
    headers: {
      'x-gm-client-key': 'client-1',
      'x-gm-timestamp': timestamp,
      'x-gm-nonce': nonce,
      'x-gm-protocol-version': '2026-06-mvp',
      'x-gm-signature': signPluginRequest({ method: 'POST', path: '/api/plugin/events', timestamp, nonce, body: rawBody }, secret),
    },
  };

  const guard = new PluginAuthGuard(config(), prisma);
  assert.equal(await guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as never), true);
});

test('plugin guard returns stable approval, blocked, protocol, and clock errors', async () => {
  const secret = 'test-secret';
  const base = {
    id: 'plugin-1',
    status: 'active',
    expiresAt: null,
    protocolVersion: '2026-06-mvp',
    clientSecretHash: secret,
    serverId: 'server-1',
    clientKey: 'client-1',
    server: { serverCode: 'survival', gameId: 'game-1', status: 'pending', game: { code: 'minecraft', status: 'active' } },
  };
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = '03'.repeat(32);
  const headers = {
    'x-gm-client-key': 'client-1',
    'x-gm-timestamp': timestamp,
    'x-gm-nonce': nonce,
    'x-gm-signature': signPluginRequest({ method: 'GET', path: '/api/plugin/bindings/session-1', timestamp, nonce, body: '' }, secret),
    'x-gm-protocol-version': '2026-06-mvp',
  };

  let error = await guardError(guardWithClient(base), pluginRequest({ ...headers, 'x-gm-signature': '00'.repeat(32) }));
  assert.equal(error.getStatus(), 401);
  assert.equal(error.getResponse().code, 'AUTHENTICATION_FAILED');

  const { 'x-gm-protocol-version': _protocolVersion, ...withoutProtocol } = headers;
  error = await guardError(guardWithClient(base), pluginRequest({ ...withoutProtocol, 'x-gm-signature': '00'.repeat(32) }));
  assert.equal(error.getStatus(), 401);
  assert.equal(error.getResponse().code, 'AUTHENTICATION_FAILED');

  error = await guardError(guardWithClient(base), pluginRequest(withoutProtocol));
  assert.equal(error.getStatus(), 426);
  assert.equal(error.getResponse().code, 'PROTOCOL_UNSUPPORTED');

  error = await guardError(guardWithClient(base), pluginRequest(headers));
  assert.equal(error.getStatus(), 403);
  assert.equal(error.getResponse().code, 'SERVER_PENDING_APPROVAL');

  error = await guardError(guardWithClient({ ...base, server: { ...base.server, status: 'blocked' } }), pluginRequest(headers));
  assert.equal(error.getStatus(), 403);
  assert.equal(error.getResponse().code, 'SERVER_BLOCKED');

  error = await guardError(guardWithClient({ ...base, server: { ...base.server, status: 'active' } }), pluginRequest({ ...headers, 'x-gm-protocol-version': 'old' }));
  assert.equal(error.getStatus(), 426);
  assert.equal(error.getResponse().code, 'PROTOCOL_UNSUPPORTED');

  error = await guardError(guardWithClient(base), pluginRequest({ ...headers, 'x-gm-timestamp': String(Math.floor(Date.now() / 1000) - 1000) }));
  assert.equal(error.getStatus(), 401);
  assert.equal(error.getResponse().code, 'CLOCK_SKEW');
  assert.equal(typeof error.getResponse().serverTime, 'number');
});

test('plugin nonce replay has its own conflict code', async () => {
  const prisma = {
    pluginRequestNonce: {
      deleteMany: async () => ({ count: 0 }),
      create: async () => {
        throw new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' });
      },
    },
  } as unknown as PrismaService;
  const guard = new PluginAuthGuard(config(), prisma);
  await assert.rejects(
    (guard as unknown as { rememberNonce: (id: string, nonce: string, timestamp: number) => Promise<void> })
      .rememberNonce('plugin-1', 'nonce-1', Math.floor(Date.now() / 1000)),
    (error: { getStatus: () => number; getResponse: () => { code: string } }) =>
      error.getStatus() === 409 && error.getResponse().code === 'NONCE_REPLAY',
  );
});

test('plugin session status lookup is server and credential scoped and never returns a token', async () => {
  const prisma = {
    bindingSession: {
      findFirst: async (args: { where: Record<string, string> }) => {
        assert.deepEqual(args.where, { id: 'session-1', serverId: 'server-1', pluginClientId: 'plugin-1' });
        return {
          id: 'session-1', platform: 'java', gameUserId: 'player-1', displayName: 'Player One', bindMode: 'bind_existing',
          status: 'pending', expiresAt: new Date(Date.now() + 60_000), authenticatedAt: null,
          game: { code: 'minecraft', name: 'Minecraft' }, server: { serverCode: 'survival', serverName: 'Survival' },
        };
      },
    },
  } as unknown as PrismaService;
  const result = await new BindingService(config(), prisma).findForPlugin(pluginClient, 'session-1');
  assert.equal(result.sessionId, 'session-1');
  assert.equal('id' in result, false);
  assert.equal('token' in result, false);
});

test('plugin exception filter returns stable rate limit, validation, and unavailable contracts', () => {
  const cases = [
    {
      exception: new HttpException('upstream clientSecret=do-not-leak', HttpStatus.TOO_MANY_REQUESTS),
      status: 429,
      code: PLUGIN_ERROR_CODES.rateLimited,
      retryable: true,
      message: 'Rate limit exceeded',
    },
    {
      exception: new BadRequestException(['requestId must be longer than or equal to 8 characters']),
      status: 400,
      code: PLUGIN_ERROR_CODES.invalidRequest,
      retryable: false,
      message: 'requestId must be longer than or equal to 8 characters',
    },
    {
      exception: new ServiceUnavailableException('postgresql://admin:password@db.internal/gamemulti'),
      status: 503,
      code: PLUGIN_ERROR_CODES.serviceUnavailable,
      retryable: true,
      message: 'Service temporarily unavailable',
    },
    {
      exception: new NotFoundException('Binding session not found'),
      status: 404,
      code: PLUGIN_ERROR_CODES.invalidRequest,
      retryable: false,
      message: 'Binding session not found',
    },
  ];

  for (const expected of cases) {
    const result = filteredPluginResponse(expected.exception);
    assert.equal(result.status, expected.status);
    assert.equal(result.body.code, expected.code);
    assert.equal(result.body.retryable, expected.retryable);
    assert.equal(result.body.message, expected.message);
    assertPluginErrorBody(result.body);
    assert.doesNotMatch(result.serialized, /do-not-leak|postgresql:\/\/|clientSecret|binding-token/i);
  }
});

test('plugin exception filter preserves optional serverTime and safe details fields', () => {
  const clock = filteredPluginResponse(new PluginApiError(
    HttpStatus.UNAUTHORIZED,
    PLUGIN_ERROR_CODES.clockSkew,
    'Plugin timestamp outside allowed window',
    true,
  ));
  assertPluginErrorBody(clock.body);
  assert.equal(typeof clock.body.serverTime, 'number');
  assert.equal('details' in clock.body, false);

  const protocol = filteredPluginResponse(new PluginApiError(
    426,
    PLUGIN_ERROR_CODES.protocolUnsupported,
    'Plugin protocol version is not supported',
    false,
    { supportedVersions: ['2026-06-mvp'] },
  ));
  assertPluginErrorBody(protocol.body);
  assert.deepEqual(protocol.body.details, { supportedVersions: ['2026-06-mvp'] });
  assert.equal('serverTime' in protocol.body, false);
  assert.doesNotMatch(protocol.serialized, /clientSecret|binding-token|postgresql:\/\//i);
});

test('plugin exception filter delegates non-plugin failures to the Nest default response', () => {
  let status: number | undefined;
  let body: unknown;
  const response = {};
  const adapter = {
    isHeadersSent: () => false,
    reply: (_response: unknown, value: unknown, statusCode: number) => {
      body = value;
      status = statusCode;
    },
    end: () => undefined,
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ path: '/api/me' }),
      getResponse: () => response,
    }),
    getArgByIndex: (index: number) => index === 1 ? response : undefined,
  };

  new PluginApiExceptionFilter(adapter as never).catch(new Error('database details'), host as never);

  assert.equal(status, 500);
  assert.deepEqual(body, { statusCode: 500, message: 'Internal server error' });
});

test('binding session create is idempotent for retries and concurrent unique conflicts', async () => {
  const existing = {
    id: 'session-1', token: 'secret-token', pairCode: '123456', expiresAt: new Date(Date.now() + 60_000),
    requestPayloadHash: 'placeholder',
  };
  let findCount = 0;
  const prisma = {
    bindingSession: {
      findUnique: async () => {
        findCount += 1;
        return findCount === 1 ? null : { ...existing, requestPayloadHash: (service as unknown as { hashBindingRequest: (value: unknown) => string }).hashBindingRequest(createParams) };
      },
      create: async () => {
        throw new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' });
      },
    },
  } as unknown as PrismaService;
  const service = new BindingService(config(), prisma);
  (service as unknown as { createUniqueToken: () => Promise<string> }).createUniqueToken = async () => 'unused-token';
  (service as unknown as { createUniquePairCode: () => Promise<string> }).createUniquePairCode = async () => '000000';
  const result = await service.createSession(pluginClient, createParams);
  assert.equal(result.sessionId, 'session-1');
  assert.equal(result.token, 'secret-token');
  assert.equal(findCount, 2);
});

test('controller returns idempotency conflict for changed payload without creating a session', async () => {
  let createCount = 0;
  let tokenCount = 0;
  let pairCodeCount = 0;
  const prisma = {
    bindingSession: {
      findUnique: async (args: {
        where: { pluginClientId_requestId: { pluginClientId: string; requestId: string } };
      }) => {
        assert.deepEqual(args.where.pluginClientId_requestId, {
          pluginClientId: 'plugin-1',
          requestId: 'request-123',
        });
        return {
          id: 'session-existing',
          token: 'binding-token-must-not-leak',
          pairCode: '123456',
          expiresAt: new Date(Date.now() + 60_000),
          requestPayloadHash: 'hash-for-original-payload',
        };
      },
      create: async () => {
        createCount += 1;
        throw new Error('must not create a session for an idempotency conflict');
      },
    },
  } as unknown as PrismaService;
  const service = new BindingService(config(), prisma);
  (service as unknown as { createUniqueToken: () => Promise<string> }).createUniqueToken = async () => {
    tokenCount += 1;
    return 'new-token';
  };
  (service as unknown as { createUniquePairCode: () => Promise<string> }).createUniquePairCode = async () => {
    pairCodeCount += 1;
    return '000000';
  };
  const controller = new BindingController(service);

  let exception: unknown;
  try {
    await controller.createSession(pluginClient, { ...createParams, gameUserId: 'changed-player' });
  } catch (error) {
    exception = error;
  }
  assert.ok(exception instanceof PluginApiError);
  const result = filteredPluginResponse(exception);
  assert.equal(result.status, 409);
  assert.equal(result.body.code, PLUGIN_ERROR_CODES.idempotencyConflict);
  assert.equal(result.body.retryable, false);
  assertPluginErrorBody(result.body);
  assert.equal(createCount, 0);
  assert.equal(tokenCount, 0);
  assert.equal(pairCodeCount, 0);
  assert.doesNotMatch(result.serialized, /binding-token-must-not-leak|clientSecret|postgresql:\/\//i);
});
