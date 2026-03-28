const crypto = require('node:crypto');

class MinecraftPluginPoCService {
  constructor({ apiBaseUrl = 'https://gamemulti.local', serverId = 'mc-poc-01', serverCode = 'cn-mc-01', pluginClientKey = 'demo-client', now = () => new Date(), } = {}) {
    this.apiBaseUrl = apiBaseUrl;
    this.serverId = serverId;
    this.serverCode = serverCode;
    this.pluginClientKey = pluginClientKey;
    this.now = now;
    this.onlinePlayers = new Map();
    this.bindingRequests = [];
    this.eventQueue = [];
    this.statusReports = [];
  }

  createBindingCommand({ gameCode = 'minecraft', platform = 'java', playerUuid, displayName }) {
    if (!playerUuid || !displayName) {
      throw this.businessError('INVALID_ARGUMENT', 'playerUuid and displayName are required');
    }

    const sessionId = this.id('binding_session');
    const token = this.randomToken(16);
    const pairCode = this.randomDigits(6);
    const request = {
      id: sessionId,
      gameCode,
      platform,
      playerUuid,
      displayName,
      token,
      pairCode,
      status: 'pending',
      createdAt: this.now().toISOString(),
      expiresAt: new Date(this.now().getTime() + 5 * 60 * 1000).toISOString(),
    };

    this.bindingRequests.push(request);

    return {
      command: `/gm bind ${displayName}`,
      endpoint: `${this.apiBaseUrl}/api/plugin/bindings/session`,
      payload: {
        pluginClientKey: this.pluginClientKey,
        serverCode: this.serverCode,
        gameCode,
        platform,
        gameUserId: playerUuid,
        displayName,
        bindMode: 'bind_existing',
      },
      response: {
        sessionId,
        token,
        pairCode,
        expiresIn: 300,
        bindUrl: `${this.apiBaseUrl}/bind/confirm?token=${token}`,
      },
    };
  }

  recordPlayerJoin({ playerUuid, displayName }) {
    const joinedAt = this.now();
    this.onlinePlayers.set(playerUuid, { displayName, joinedAt });
    return this.pushEvent({
      eventType: 'player_join',
      playerUuid,
      displayName,
      occurredAt: joinedAt.toISOString(),
      metadata: { source: 'player_join_listener' },
    });
  }

  recordPlayerQuit({ playerUuid }) {
    const online = this.onlinePlayers.get(playerUuid);
    const occurredAt = this.now();
    this.onlinePlayers.delete(playerUuid);

    return this.pushEvent({
      eventType: 'player_quit',
      playerUuid,
      displayName: online?.displayName || 'unknown',
      occurredAt: occurredAt.toISOString(),
      metadata: {
        source: 'player_quit_listener',
        sessionDurationSeconds: online ? Math.max(0, Math.floor((occurredAt - online.joinedAt) / 1000)) : 0,
      },
    });
  }

  recordDurationTick({ playerUuid, durationMinutes = 10 }) {
    const online = this.onlinePlayers.get(playerUuid);
    if (!online) {
      throw this.businessError('PLAYER_NOT_ONLINE', 'Player must be online before duration reporting');
    }

    return this.pushEvent({
      eventType: 'online_duration',
      playerUuid,
      displayName: online.displayName,
      occurredAt: this.now().toISOString(),
      metadata: {
        source: 'duration_scheduler',
        durationMinutes,
        rewardWindow: `${durationMinutes}m`,
      },
    });
  }

  reportStatus(options = {}) {
    const {
      onlineCount = this.onlinePlayers.size,
      healthy = true,
      queueDepth = this.eventQueue.length,
    } = options;

    const report = {
      statusId: this.id('status'),
      endpoint: `${this.apiBaseUrl}/api/game-servers/heartbeat`,
      payload: {
        pluginClientKey: this.pluginClientKey,
        serverId: this.serverId,
        serverCode: this.serverCode,
        healthy,
        onlineCount,
        queueDepth,
        sentAt: this.now().toISOString(),
      },
    };

    this.statusReports.push(report);
    return report;
  }

  pushEvent({ eventType, playerUuid, displayName, occurredAt, metadata }) {
    const event = {
      eventId: this.id('evt'),
      endpoint: `${this.apiBaseUrl}/api/plugin/events`,
      payload: {
        serverId: this.serverId,
        serverCode: this.serverCode,
        eventType,
        playerUuid,
        displayName,
        occurredAt,
        metadata,
      },
    };

    this.eventQueue.push(event);
    return event;
  }

  businessError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
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

module.exports = {
  MinecraftPluginPoCService,
};
