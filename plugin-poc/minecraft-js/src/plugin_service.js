const crypto = require('node:crypto');

class MinecraftPluginPoCService {
  constructor({
    apiBaseUrl = 'https://gamemulti.local',
    serverId = 'mc-poc-01',
    serverCode = 'cn-mc-01',
    pluginClientKey = 'demo-client',
    pluginClientSecret = 'demo-secret',
    publicHost = null,
    publicPort = 25565,
    now = () => new Date(),
    fetchImpl = globalThis.fetch,
    randomBytes = crypto.randomBytes,
  } = {}) {
    this.apiBaseUrl = apiBaseUrl;
    this.serverId = serverId;
    this.serverCode = serverCode;
    this.pluginClientKey = pluginClientKey;
    this.pluginClientSecret = pluginClientSecret;
    this.publicHost = publicHost;
    this.publicPort = publicPort;
    this.now = now;
    this.fetchImpl = fetchImpl;
    this.randomBytes = randomBytes;
    this.onlinePlayers = new Map();
    this.bindingRequests = [];
    this.eventQueue = [];
    this.statusReports = [];
  }

  async claimInstallation({
    installToken,
    serverName,
    serverCode = this.serverCode,
    publicHost = this.publicHost,
    publicPort = this.publicPort,
    pluginVersion = 'temporary',
    protocolVersion = '2026-06-mvp',
    region,
  }) {
    if (!this.fetchImpl) {
      throw this.businessError('FETCH_UNAVAILABLE', 'fetch implementation is required');
    }
    if (!installToken || !serverName) {
      throw this.businessError('INVALID_ARGUMENT', 'installToken and serverName are required');
    }

    const response = await this.fetchImpl(`${this.apiBaseUrl}/api/plugin/installations/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        installToken,
        serverName,
        serverCode,
        publicHost,
        publicPort,
        pluginVersion,
        protocolVersion,
        region,
      }),
    });
    const data = await this.parseJsonResponse(response);
    if (!response.ok) {
      const message = data?.message || `Plugin installation claim failed with HTTP ${response.status}`;
      const error = this.businessError('PLUGIN_INSTALL_CLAIM_FAILED', message);
      error.status = response.status;
      error.response = data;
      throw error;
    }

    this.serverCode = data.server.serverCode;
    this.pluginClientKey = data.pluginClient.clientKey;
    this.pluginClientSecret = data.pluginClient.clientSecret;
    this.publicHost = publicHost;
    this.publicPort = publicPort;

    return data;
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
        bindUrl: `/bind/confirm?token=${token}`,
        publicBindUrl: `${this.apiBaseUrl}/bind/confirm?token=${token}`,
      },
    };
  }

  async requestBindingSession({ gameCode = 'minecraft', platform = 'java', playerUuid, displayName, bindMode = 'bind_existing' }) {
    if (!this.fetchImpl) {
      throw this.businessError('FETCH_UNAVAILABLE', 'fetch implementation is required');
    }
    if (!playerUuid || !displayName) {
      throw this.businessError('INVALID_ARGUMENT', 'playerUuid and displayName are required');
    }

    const payload = {
      serverCode: this.serverCode,
      gameCode,
      platform,
      gameUserId: playerUuid,
      displayName,
      bindMode,
    };
    const request = this.buildSignedRequest({
      method: 'POST',
      path: '/api/plugin/bindings/session',
      body: payload,
    });

    const response = await this.fetchImpl(`${this.apiBaseUrl}${request.path}`, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    const data = await this.parseJsonResponse(response);
    if (!response.ok) {
      const message = data?.message || `Binding session request failed with HTTP ${response.status}`;
      const error = this.businessError('BINDING_SESSION_REQUEST_FAILED', message);
      error.status = response.status;
      error.response = data;
      throw error;
    }

    return {
      command: `/gm bind ${displayName}`,
      endpoint: `${this.apiBaseUrl}${request.path}`,
      request,
      response: data,
      playerMessage: `绑定码 ${data.pairCode}，或打开 ${this.resolveBindUrl(data)}`,
    };
  }

  resolveBindUrl(response) {
    if (response?.publicBindUrl) {
      return response.publicBindUrl;
    }
    if (response?.bindUrl && /^https?:\/\//i.test(response.bindUrl)) {
      return response.bindUrl;
    }
    return new URL(response?.bindUrl || '/', this.apiBaseUrl).toString();
  }

  async handleCommand(input, player = {}) {
    const parts = String(input || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return this.commandResult('ignored', '请输入命令，例如 /gm bind Steve');
    }

    if (parts[0] !== '/gm') {
      return this.commandResult('ignored', '只处理 /gm 命令');
    }

    const action = parts[1];
    if (action === 'bind') {
      const displayName = parts[2] || player.displayName;
      const playerUuid = player.playerUuid || this.offlinePlayerUuid(displayName);
      const result = await this.requestBindingSession({ playerUuid, displayName });
      return this.commandResult('binding_session_created', result.playerMessage, result);
    }

    if (action === 'join') {
      const displayName = parts[2] || player.displayName;
      const playerUuid = player.playerUuid || this.offlinePlayerUuid(displayName);
      const event = this.recordPlayerJoin({ playerUuid, displayName });
      const result = await this.sendPluginEvent(event);
      return this.commandResult('player_join_reported', `${displayName} join 已上报`, result);
    }

    if (action === 'quit') {
      const displayName = parts[2] || player.displayName;
      const playerUuid = player.playerUuid || this.offlinePlayerUuid(displayName);
      const event = this.recordPlayerQuit({ playerUuid });
      const result = await this.sendPluginEvent(event);
      return this.commandResult('player_quit_reported', `${displayName} quit 已上报`, result);
    }

    if (action === 'heartbeat') {
      const report = this.reportStatus();
      const result = await this.sendHeartbeat(report);
      return this.commandResult('heartbeat_reported', `heartbeat 已上报，online=${report.payload.onlineCount} queue=${report.payload.queueDepth}`, result);
    }

    return this.commandResult('unknown_command', '支持命令：/gm bind <name>、/gm join <name>、/gm quit <name>、/gm heartbeat');
  }

  buildSignedRequest({ method, path, body }) {
    const serializedBody = JSON.stringify(body || {});
    const timestamp = Math.floor(this.now().getTime() / 1000).toString();
    const nonce = this.randomToken(16);
    const signature = this.signPluginRequest({
      method,
      path,
      timestamp,
      nonce,
      body: serializedBody,
    });

    return {
      method: method.toUpperCase(),
      path,
      body: serializedBody,
      headers: {
        'content-type': 'application/json',
        'x-gm-client-key': this.pluginClientKey,
        'x-gm-timestamp': timestamp,
        'x-gm-nonce': nonce,
        'x-gm-signature': signature,
      },
    };
  }

  signPluginRequest({ method, path, timestamp, nonce, body }) {
    const bodyHash = crypto.createHash('sha256').update(body || '').digest('hex');
    const signaturePayload = [
      method.toUpperCase(),
      path,
      timestamp,
      nonce,
      bodyHash,
    ].join('\n');

    return crypto.createHmac('sha256', this.pluginClientSecret).update(signaturePayload).digest('hex');
  }

  async sendPluginEvent(event) {
    const data = await this.postSignedJson({
      path: '/api/plugin/events',
      body: {
        eventId: event.eventId,
        ...event.payload,
      },
      failureCode: 'PLUGIN_EVENT_REPORT_FAILED',
      failureMessage: 'Plugin event report failed',
    });

    this.eventQueue = this.eventQueue.filter((queuedEvent) => queuedEvent.eventId !== event.eventId);

    return {
      endpoint: `${this.apiBaseUrl}/api/plugin/events`,
      event,
      response: data,
    };
  }

  async sendHeartbeat(report) {
    const data = await this.postSignedJson({
      path: '/api/game-servers/heartbeat',
      body: {
        statusId: report.statusId,
        ...report.payload,
      },
      failureCode: 'HEARTBEAT_REPORT_FAILED',
      failureMessage: 'Heartbeat report failed',
    });

    return {
      endpoint: `${this.apiBaseUrl}/api/game-servers/heartbeat`,
      report,
      response: data,
    };
  }

  async postSignedJson({ path, body, failureCode, failureMessage }) {
    if (!this.fetchImpl) {
      throw this.businessError('FETCH_UNAVAILABLE', 'fetch implementation is required');
    }

    const request = this.buildSignedRequest({
      method: 'POST',
      path,
      body,
    });

    const response = await this.fetchImpl(`${this.apiBaseUrl}${request.path}`, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });
    const data = await this.parseJsonResponse(response);

    if (!response.ok) {
      const message = data?.message || `${failureMessage} with HTTP ${response.status}`;
      const error = this.businessError(failureCode, message);
      error.status = response.status;
      error.response = data;
      throw error;
    }

    return data;
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
        serverId: this.serverId,
        serverCode: this.serverCode,
        healthy,
        onlineCount,
        queueDepth,
        sentAt: this.now().toISOString(),
        metadata: {
          publicHost: this.publicHost,
          publicPort: this.publicPort,
        },
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

  commandResult(type, message, data = null) {
    return { type, message, data };
  }

  offlinePlayerUuid(displayName) {
    if (!displayName) {
      throw this.businessError('INVALID_ARGUMENT', 'displayName is required');
    }

    return `offline-${displayName.toLowerCase()}`;
  }

  randomToken(length) {
    return this.randomBytes(length).toString('hex');
  }

  randomDigits(length) {
    const max = 10 ** length;
    return String(Math.floor(Math.random() * max)).padStart(length, '0');
  }

  id(prefix) {
    return `${prefix}_${this.randomBytes(4).toString('hex')}`;
  }

  async parseJsonResponse(response) {
    const text = await response.text();
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}

module.exports = {
  MinecraftPluginPoCService,
};
