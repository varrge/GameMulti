const crypto = require('node:crypto');

/**
 * 最小可运行的邀请制账户与绑定流程内存版示例。
 *
 * 目的：
 * 1. 验证接口与状态流转是否自洽
 * 2. 作为后续迁移到真实 service / repository 层的参考
 * 3. 不依赖数据库和框架，便于快速演示
 */
class InviteBindingService {
  constructor(now = () => new Date()) {
    this.now = now;
    this.users = [];
    this.invitationCodes = [];
    this.invitationCodeUsages = [];
    this.games = [];
    this.servers = [];
    this.pluginClients = [];
    this.gameAccounts = [];
    this.bindingSessions = [];
    this.userGameBindings = [];
  }

  seed() {
    this.games.push({ id: 'game_minecraft', code: 'minecraft', name: 'Minecraft', status: 'active' });
    this.servers.push({ id: 'server_1', gameId: 'game_minecraft', serverCode: 'cn-mc-01', serverName: 'CN MC 01', status: 'active' });
    this.pluginClients.push({ id: 'plugin_1', serverId: 'server_1', clientKey: 'demo-client', status: 'active' });
    this.invitationCodes.push({
      id: 'invite_1',
      code: 'ABCD1234',
      createdBy: 'admin_1',
      ownerUserId: null,
      maxUses: 5,
      usedCount: 0,
      startsAt: null,
      expiresAt: null,
      status: 'active',
      createdAt: this.now().toISOString(),
    });
  }

  normalizeInviteCode(code) {
    return String(code || '').trim().toUpperCase();
  }

  validateInvitationCode(code) {
    const normalized = this.normalizeInviteCode(code);
    const invitation = this.invitationCodes.find((item) => item.code === normalized);

    if (!invitation) {
      return { valid: false, codeStatus: 'not_found', message: 'Invitation code not found' };
    }

    const current = this.now();

    if (invitation.status === 'disabled') {
      return { valid: false, codeStatus: 'disabled', message: 'Invitation code disabled' };
    }

    if (invitation.startsAt && current < new Date(invitation.startsAt)) {
      return { valid: false, codeStatus: 'disabled', message: 'Invitation code not started' };
    }

    if (invitation.expiresAt && current > new Date(invitation.expiresAt)) {
      return { valid: false, codeStatus: 'expired', message: 'Invitation code expired' };
    }

    if (invitation.usedCount >= invitation.maxUses) {
      return { valid: false, codeStatus: 'exhausted', message: 'Invitation code exhausted' };
    }

    return {
      valid: true,
      codeStatus: 'active',
      remainingUses: invitation.maxUses - invitation.usedCount,
      expiresAt: invitation.expiresAt,
      invitation,
    };
  }

  registerByInvite({ username, email, password, inviteCode, registerIp, registerUserAgent }) {
    if (!username || !email || !password || !inviteCode) {
      throw this.businessError('INVALID_ARGUMENT', 'Missing required fields');
    }

    if (this.users.some((item) => item.username === username)) {
      throw this.businessError('USERNAME_ALREADY_EXISTS', 'Username already exists');
    }

    if (this.users.some((item) => item.email === email)) {
      throw this.businessError('EMAIL_ALREADY_EXISTS', 'Email already exists');
    }

    const validation = this.validateInvitationCode(inviteCode);
    if (!validation.valid) {
      throw this.businessError(`INVITATION_CODE_${validation.codeStatus.toUpperCase()}`, validation.message);
    }

    const user = {
      id: this.id('user'),
      username,
      email,
      passwordHash: this.hashPassword(password),
      status: 'active',
      source: 'invite_register',
      invitedByUserId: validation.invitation.ownerUserId || null,
      invitationCodeId: validation.invitation.id,
      registerIp: registerIp || null,
      registerUserAgent: registerUserAgent || null,
      lastLoginAt: null,
      createdAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    };

    this.users.push(user);
    this.invitationCodeUsages.push({
      id: this.id('invite_usage'),
      invitationCodeId: validation.invitation.id,
      userId: user.id,
      inviterUserId: validation.invitation.ownerUserId || null,
      usedIp: registerIp || null,
      usedUserAgent: registerUserAgent || null,
      usedAt: this.now().toISOString(),
    });
    validation.invitation.usedCount += 1;

    return this.publicUser(user);
  }

  createBindingSession({ pluginClientKey, serverCode, gameCode, platform, gameUserId, displayName, bindMode }) {
    if (!pluginClientKey) {
      throw this.businessError('PLUGIN_AUTH_INVALID', 'Missing plugin client key');
    }

    const pluginClient = this.pluginClients.find((item) => item.clientKey === pluginClientKey && item.status === 'active');
    if (!pluginClient) {
      throw this.businessError('PLUGIN_AUTH_INVALID', 'Plugin authentication invalid');
    }

    const server = this.servers.find((item) => item.serverCode === serverCode);
    if (!server || server.id !== pluginClient.serverId) {
      throw this.businessError('PLUGIN_SERVER_MISMATCH', 'Plugin server mismatch');
    }

    const game = this.games.find((item) => item.code === gameCode && item.id === server.gameId);
    if (!game) {
      throw this.businessError('GAME_NOT_FOUND', 'Game not found');
    }

    const expiresAt = new Date(this.now().getTime() + 5 * 60 * 1000);
    const session = {
      id: this.id('binding_session'),
      gameId: game.id,
      serverId: server.id,
      pluginClientId: pluginClient.id,
      gameUserId,
      platform,
      displayName,
      bindMode,
      token: this.randomToken(24),
      pairCode: this.randomDigits(6),
      status: 'pending',
      gameAccountSnapshot: { gameCode, serverCode, platform, gameUserId, displayName },
      expiresAt: expiresAt.toISOString(),
      usedAt: null,
      usedByUserId: null,
      confirmedBindingId: null,
      confirmedGameAccountId: null,
      createdIp: null,
      createdAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    };

    this.bindingSessions.push(session);

    return {
      sessionId: session.id,
      token: session.token,
      pairCode: session.pairCode,
      expiresIn: 300,
      bindUrl: `https://example.com/bind/confirm?token=${session.token}`,
    };
  }

  getBindingSessionByToken(token) {
    const session = this.bindingSessions.find((item) => item.token === token);
    return this.presentBindingSession(session);
  }

  getBindingSessionByPairCode(pairCode) {
    const session = this.bindingSessions.find((item) => item.pairCode === pairCode);
    return this.presentBindingSession(session);
  }

  confirmBinding({ userId, sessionId }) {
    const user = this.users.find((item) => item.id === userId);
    if (!user) {
      throw this.businessError('USER_NOT_FOUND', 'User not found');
    }

    const session = this.bindingSessions.find((item) => item.id === sessionId);
    if (!session) {
      throw this.businessError('BINDING_SESSION_NOT_FOUND', 'Binding session not found');
    }

    if (session.status !== 'pending') {
      throw this.businessError('BINDING_SESSION_ALREADY_USED', 'Binding session already used');
    }

    if (this.now() > new Date(session.expiresAt)) {
      session.status = 'expired';
      session.updatedAt = this.now().toISOString();
      throw this.businessError('BINDING_SESSION_EXPIRED', 'Binding session expired');
    }

    const normalizedGameUserId = String(session.gameUserId).trim().toLowerCase();
    let gameAccount = this.gameAccounts.find(
      (item) => item.gameId === session.gameId && item.platform === session.platform && item.normalizedGameUserId === normalizedGameUserId,
    );

    if (!gameAccount) {
      gameAccount = {
        id: this.id('game_account'),
        gameId: session.gameId,
        platform: session.platform,
        gameUserId: session.gameUserId,
        normalizedGameUserId,
        displayName: session.displayName,
        extraMeta: null,
        createdAt: this.now().toISOString(),
        updatedAt: this.now().toISOString(),
      };
      this.gameAccounts.push(gameAccount);
    }

    const existingActiveBinding = this.userGameBindings.find(
      (item) => item.gameAccountId === gameAccount.id && item.bindStatus === 'active' && item.userId !== user.id,
    );
    if (existingActiveBinding) {
      throw this.businessError('GAME_ACCOUNT_ALREADY_BOUND', 'Game account already bound to another user');
    }

    let binding = this.userGameBindings.find((item) => item.userId === user.id && item.gameAccountId === gameAccount.id);
    if (!binding) {
      binding = {
        id: this.id('user_game_binding'),
        userId: user.id,
        gameAccountId: gameAccount.id,
        serverId: session.serverId,
        bindStatus: 'active',
        bindSource: 'binding_session_confirm',
        verifiedBy: 'system',
        verifiedAt: this.now().toISOString(),
        unbindRequestedAt: null,
        unbindApprovedAt: null,
        unbindCooldownUntil: null,
        createdAt: this.now().toISOString(),
        updatedAt: this.now().toISOString(),
      };
      this.userGameBindings.push(binding);
    }

    session.status = 'confirmed';
    session.usedAt = this.now().toISOString();
    session.usedByUserId = user.id;
    session.confirmedBindingId = binding.id;
    session.confirmedGameAccountId = gameAccount.id;
    session.updatedAt = this.now().toISOString();

    return {
      bindingId: binding.id,
      gameAccountId: gameAccount.id,
      status: binding.bindStatus,
    };
  }

  presentBindingSession(session) {
    if (!session) {
      throw this.businessError('BINDING_SESSION_NOT_FOUND', 'Binding session not found');
    }

    if (session.status === 'pending' && this.now() > new Date(session.expiresAt)) {
      session.status = 'expired';
      session.updatedAt = this.now().toISOString();
    }

    return {
      sessionId: session.id,
      gameCode: session.gameAccountSnapshot.gameCode,
      serverCode: session.gameAccountSnapshot.serverCode,
      platform: session.platform,
      gameUserId: session.gameUserId,
      displayName: session.displayName,
      status: session.status,
      expiresAt: session.expiresAt,
      canConfirm: session.status === 'pending' && this.now() <= new Date(session.expiresAt),
    };
  }

  publicUser(user) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      status: user.status,
    };
  }

  businessError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  hashPassword(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  randomToken(length) {
    return crypto.randomBytes(length).toString('hex');
  }

  randomDigits(length) {
    const max = 10 ** length;
    return String(Math.floor(Math.random() * max)).padStart(length, '0');
  }

  id(prefix) {
    return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
  }
}

if (require.main === module) {
  const service = new InviteBindingService();
  service.seed();

  const validation = service.validateInvitationCode('abcd1234');
  console.log('validateInvitationCode =>', validation);

  const user = service.registerByInvite({
    username: 'player_one',
    email: 'player_one@example.com',
    password: '12345678',
    inviteCode: 'ABCD1234',
    registerIp: '127.0.0.1',
    registerUserAgent: 'demo-cli',
  });
  console.log('registerByInvite =>', user);

  const session = service.createBindingSession({
    pluginClientKey: 'demo-client',
    serverCode: 'cn-mc-01',
    gameCode: 'minecraft',
    platform: 'java',
    gameUserId: 'UUID-123',
    displayName: 'Steve',
    bindMode: 'bind_existing',
  });
  console.log('createBindingSession =>', session);

  const byToken = service.getBindingSessionByToken(session.token);
  console.log('getBindingSessionByToken =>', byToken);

  const binding = service.confirmBinding({ userId: user.id, sessionId: session.sessionId });
  console.log('confirmBinding =>', binding);
}

module.exports = {
  InviteBindingService,
};
