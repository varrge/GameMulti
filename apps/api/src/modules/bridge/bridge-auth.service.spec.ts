import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { encodeDiscoursePayload, signDiscoursePayload } from '../../security/discourse-sso';
import { BindingService } from '../binding/binding.service';
import { BridgeAuthService } from './bridge-auth.service';

const configValues: Record<string, string> = {
  APP_SECRET: 'test-app-secret-with-enough-entropy',
  BRIDGE_PUBLIC_ORIGIN: 'https://bridge.example.com',
  FORUM_ORIGIN: 'https://forum.example.com',
  DISCOURSE_PROVIDER_SECRET: 'test-discourse-secret',
};

function createService(bindingOverrides: Partial<BindingService> = {}) {
  const config = {
    get: (key: string, fallback?: string) => configValues[key] ?? fallback,
  } as ConfigService;
  const prisma = {} as PrismaService;
  const binding = {
    beginDiscourseAuthentication: async () => ({
      nonce: 'binding-nonce',
      purpose: 'binding_confirm',
      sessionId: 'binding-1',
      serverId: 'server-1',
      expiresAt: new Date(Date.now() + 120_000),
    }),
    ...bindingOverrides,
  } as BindingService;
  return new BridgeAuthService(config, prisma, binding);
}

function responseRecorder() {
  const cookies: Array<{ name: string; value: string }> = [];
  return {
    cookies,
    response: {
      cookie: (name: string, value: string) => cookies.push({ name, value }),
      clearCookie: () => undefined,
    } as unknown as Response,
  };
}

test('signed SSO state binds the original purpose, session, server, and canonical return target', async () => {
  const service = createService();
  const recorder = responseRecorder();
  await service.createDiscourseLoginRedirect(
    recorder.response,
    '/bind/confirm?token=token-1&next=https://evil.example',
  );

  const signed = recorder.cookies[0].value;
  const payload = signed.split('.')[0];
  const state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  assert.deepEqual({
    purpose: state.purpose,
    bindingSessionId: state.bindingSessionId,
    serverId: state.serverId,
    returnTo: state.returnTo,
  }, {
    purpose: 'binding_confirm',
    bindingSessionId: 'binding-1',
    serverId: 'server-1',
    returnTo: '/bind/confirm?token=token-1',
  });
});

test('rejects a tampered state cookie before consuming identity or binding context', async () => {
  let consumed = false;
  const service = createService({
    consumeDiscourseAuthentication: async () => {
      consumed = true;
      return { sessionId: 'binding-1', token: 'token-1', serverId: 'server-1' };
    },
  });
  const recorder = responseRecorder();
  await service.createDiscourseLoginRedirect(recorder.response, '/bind/confirm?token=token-1');
  const signed = recorder.cookies[0].value;
  const tampered = `${signed.slice(0, -1)}${signed.endsWith('a') ? 'b' : 'a'}`;
  const sso = encodeDiscoursePayload({
    nonce: 'binding-nonce',
    external_id: 'user-42',
    username: 'player',
  });
  const request = {
    headers: { cookie: `gm_bridge_sso_state=${encodeURIComponent(tampered)}` },
  } as Request;

  await assert.rejects(service.consumeDiscourseCallback(request, recorder.response, {
    sso,
    sig: signDiscoursePayload(sso, configValues.DISCOURSE_PROVIDER_SECRET),
  }), /Invalid Discourse SSO state/);
  assert.equal(consumed, false);
});
