import assert from 'node:assert/strict';
import test from 'node:test';
import { requiresBindingAuthentication } from './binding-confirm-access';

test('forces binding SSO even when a general Bridge session already exists', () => {
  assert.equal(requiresBindingAuthentication({
    hasCurrentUser: true,
    nextAction: 'authenticate_with_discourse',
  }), true);
});

test('allows the matching user to continue after binding SSO authentication', () => {
  assert.equal(requiresBindingAuthentication({
    hasCurrentUser: true,
    nextAction: 'confirm_binding',
  }), false);
});

test('requires login when no Bridge user session exists', () => {
  assert.equal(requiresBindingAuthentication({
    hasCurrentUser: false,
    nextAction: 'confirm_binding',
  }), true);
});
