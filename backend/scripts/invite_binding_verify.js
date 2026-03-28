const { InviteBindingService } = require('../examples/invite_binding_service');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const fixedNow = new Date('2026-03-28T01:37:00.000Z');
  const service = new InviteBindingService(() => new Date(fixedNow));
  service.seed();

  const result = {
    verifiedAt: fixedNow.toISOString(),
    path: [],
  };

  const inviteValidation = service.validateInvitationCode('abcd1234');
  assert(inviteValidation.valid === true, '邀请码校验应成功');
  result.path.push({
    step: 'validate_invitation',
    api: 'POST /api/invitations/validate',
    request: { code: 'ABCD1234' },
    response: {
      valid: inviteValidation.valid,
      codeStatus: inviteValidation.codeStatus,
      remainingUses: inviteValidation.remainingUses,
      expiresAt: inviteValidation.expiresAt,
    },
  });

  const user = service.registerByInvite({
    username: 'player_one',
    email: 'player_one@example.com',
    password: '12345678',
    inviteCode: 'ABCD1234',
    registerIp: '127.0.0.1',
    registerUserAgent: 'invite-binding-verify/1.0',
  });
  assert(user.username === 'player_one', '邀请注册后用户名不匹配');
  result.path.push({
    step: 'invite_register',
    api: 'POST /api/auth/invite-register',
    request: {
      username: 'player_one',
      email: 'player_one@example.com',
      password: '12345678',
      inviteCode: 'ABCD1234',
    },
    response: { user },
  });

  const sessionCreated = service.createBindingSession({
    pluginClientKey: 'demo-client',
    serverCode: 'cn-mc-01',
    gameCode: 'minecraft',
    platform: 'java',
    gameUserId: 'UUID-123',
    displayName: 'Steve',
    bindMode: 'bind_existing',
  });
  assert(sessionCreated.sessionId, '绑定会话未创建');
  result.path.push({
    step: 'create_binding_session',
    api: 'POST /api/plugin/bindings/session',
    request: {
      serverCode: 'cn-mc-01',
      gameCode: 'minecraft',
      platform: 'java',
      gameUserId: 'UUID-123',
      displayName: 'Steve',
      bindMode: 'bind_existing',
    },
    response: sessionCreated,
  });

  const sessionByToken = service.getBindingSessionByToken(sessionCreated.token);
  assert(sessionByToken.canConfirm === true, 'token 查询结果应允许确认');
  result.path.push({
    step: 'query_binding_session_by_token',
    api: 'GET /api/bindings/session/by-token',
    request: { token: sessionCreated.token },
    response: sessionByToken,
  });

  const sessionByPairCode = service.getBindingSessionByPairCode(sessionCreated.pairCode);
  assert(sessionByPairCode.pairCode !== sessionCreated.pairCode, '响应中不应回显 pairCode');
  assert(sessionByPairCode.sessionId === sessionCreated.sessionId, 'pair code 查询到的 sessionId 不匹配');
  result.path.push({
    step: 'query_binding_session_by_pair_code',
    api: 'POST /api/bindings/session/by-pair-code',
    request: { pairCode: sessionCreated.pairCode },
    response: sessionByPairCode,
  });

  const binding = service.confirmBinding({ userId: user.id, sessionId: sessionCreated.sessionId });
  assert(binding.status === 'active', '绑定状态应为 active');
  result.path.push({
    step: 'confirm_binding',
    api: 'POST /api/bindings/confirm',
    request: { sessionId: sessionCreated.sessionId },
    response: binding,
  });

  const confirmedSession = service.getBindingSessionByToken(sessionCreated.token);
  assert(confirmedSession.status === 'confirmed', '确认绑定后会话状态应为 confirmed');

  result.state = {
    users: service.users,
    invitationCodes: service.invitationCodes,
    invitationCodeUsages: service.invitationCodeUsages,
    bindingSessions: service.bindingSessions,
    gameAccounts: service.gameAccounts,
    userGameBindings: service.userGameBindings,
  };

  result.summary = {
    totalUsers: service.users.length,
    totalInvitationCodeUsages: service.invitationCodeUsages.length,
    totalBindingSessions: service.bindingSessions.length,
    totalGameAccounts: service.gameAccounts.length,
    totalUserGameBindings: service.userGameBindings.length,
    finalBindingSessionStatus: confirmedSession.status,
  };

  console.log(JSON.stringify(result, null, 2));
}

try {
  main();
} catch (error) {
  console.error('[invite_binding_verify] failed:', error.message);
  process.exitCode = 1;
}
