import assert from 'node:assert/strict';
import test from 'node:test';
import { BindingSessionStatus } from '@prisma/client';
import { mapBindingStatus } from './binding-status';

const future = new Date('2030-01-01T00:00:00.000Z');
const now = new Date('2029-01-01T00:00:00.000Z');

test('pending sessions preserve the P0 status while exposing the current recovery action', () => {
  assert.deepEqual(mapBindingStatus({ status: BindingSessionStatus.pending, expiresAt: future, now }), {
    status: 'pending',
    recoverable: true,
    nextAction: 'authenticate_with_discourse',
  });
  assert.equal(mapBindingStatus({
    status: BindingSessionStatus.pending,
    expiresAt: future,
    authenticatedAt: now,
    now,
  }).nextAction, 'confirm_binding');
});

test('wall-clock expiry maps pending sessions to a recoverable restart', () => {
  assert.deepEqual(mapBindingStatus({
    status: BindingSessionStatus.pending,
    expiresAt: new Date('2028-01-01T00:00:00.000Z'),
    now,
  }), {
    status: 'expired',
    recoverable: true,
    nextAction: 'start_new_binding',
  });
});

test('maps every terminal P0 status to its prescribed recovery action', () => {
  const cases = [
    [BindingSessionStatus.confirmed, 'bound', 'enter_game_or_community'],
    [BindingSessionStatus.expired, 'expired', 'start_new_binding'],
    [BindingSessionStatus.cancelled, 'cancelled', 'return_to_source'],
    [BindingSessionStatus.conflict, 'conflict', 'contact_operations_or_unbind'],
    [BindingSessionStatus.revoked, 'revoked', 'rebind_or_view_reason'],
    [BindingSessionStatus.denied, 'denied', 'view_authorization_requirements'],
    [BindingSessionStatus.unavailable, 'unavailable', 'retry_later'],
  ] as const;

  for (const [sessionStatus, status, nextAction] of cases) {
    const result = mapBindingStatus({ status: sessionStatus, expiresAt: future, now });
    assert.equal(result.status, status);
    assert.equal(result.nextAction, nextAction);
  }
});
