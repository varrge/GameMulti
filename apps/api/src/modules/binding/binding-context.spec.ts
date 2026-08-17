import assert from 'node:assert/strict';
import test from 'node:test';
import { assertBindingAuthenticationContext } from './binding-context';

const authenticatedAt = new Date();

test('accepts matching Discourse and server context', () => {
  assert.doesNotThrow(() => assertBindingAuthenticationContext({
    requireDiscourseContext: true,
    authenticatedAt,
    authenticatedDiscourseUserId: '42',
    authenticatedServerId: 'server-a',
    discourseUserId: '42',
    serverId: 'server-a',
  }));
});

test('rejects confirmation by another Discourse user', () => {
  assert.throws(() => assertBindingAuthenticationContext({
    requireDiscourseContext: true,
    authenticatedAt,
    authenticatedDiscourseUserId: '42',
    authenticatedServerId: 'server-a',
    discourseUserId: '99',
    serverId: 'server-a',
  }), /another Discourse user/);
});

test('rejects a different server context', () => {
  assert.throws(() => assertBindingAuthenticationContext({
    requireDiscourseContext: true,
    authenticatedAt,
    authenticatedDiscourseUserId: '42',
    authenticatedServerId: 'server-b',
    discourseUserId: '42',
    serverId: 'server-a',
  }), /server context mismatch/);
});

test('requires callback context on the Bridge confirmation path', () => {
  assert.throws(() => assertBindingAuthenticationContext({
    requireDiscourseContext: true,
    discourseUserId: '42',
    serverId: 'server-a',
  }), /requires Discourse authentication/);
});
