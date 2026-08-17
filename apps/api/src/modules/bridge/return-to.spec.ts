import assert from 'node:assert/strict';
import test from 'node:test';
import { bindingTokenFromReturnTo, safeBridgeReturnTo } from './return-to';

const origin = 'https://bridge.example.com';

test('allows only the exact binding destinations and parameter sets', () => {
  assert.equal(safeBridgeReturnTo('/bind/account', origin), '/bind/account');
  assert.equal(safeBridgeReturnTo('/bind/account?next=/admin&tab=x', origin), '/bind/account');
  assert.equal(safeBridgeReturnTo('/bind/confirm?token=abc_123-Z', origin), '/bind/confirm?token=abc_123-Z');
  assert.equal(bindingTokenFromReturnTo('/bind/confirm?token=abc_123-Z', origin), 'abc_123-Z');
});

test('rejects cross-origin, protocol-relative, credentialed, fragmented, and unrelated destinations', () => {
  assert.equal(safeBridgeReturnTo('https://evil.example/bind/confirm?token=x', origin), '/');
  assert.equal(safeBridgeReturnTo('//evil.example/bind/account', origin), '/');
  assert.equal(safeBridgeReturnTo('https://user:pass@bridge.example.com/bind/account', origin), '/');
  assert.equal(safeBridgeReturnTo('/bind/account#private', origin), '/');
  assert.equal(safeBridgeReturnTo('/admin?next=/bind/account', origin), '/');
});

test('canonicalizes confirmation destinations and drops every non-whitelisted parameter', () => {
  assert.equal(
    safeBridgeReturnTo('/bind/confirm?token=abc123&next=https://evil.example&token=second', origin),
    '/bind/confirm?token=abc123',
  );
  assert.equal(safeBridgeReturnTo('/bind/confirm?token=a%20b', origin), '/');
  assert.equal(safeBridgeReturnTo('/bind/confirm?next=x', origin), '/');
  assert.equal(bindingTokenFromReturnTo('/bind/confirm?token=a%20b', origin), null);
});
