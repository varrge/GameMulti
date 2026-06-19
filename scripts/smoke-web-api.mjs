import { createHash, createHmac, randomUUID } from 'node:crypto';

const appBaseUrl = stripTrailingSlash(process.env.APP_BASE_URL || 'http://127.0.0.1:8080');
const apiBaseUrl = stripTrailingSlash(process.env.API_BASE_URL || `${appBaseUrl}/api`);

const pluginClientKey = process.env.PLUGIN_CLIENT_KEY || 'demo-client';
const pluginClientSecret = process.env.PLUGIN_CLIENT_SECRET || 'demo-secret';
const adminApiKey = process.env.ADMIN_API_KEY || 'local-dev-admin-key';
const forumSsoSecret = process.env.FORUM_SSO_SECRET || 'local-dev-forum-sso-secret';

const runId = Date.now().toString(36);
const username = `smoke_${runId}`;
const email = `${username}@example.test`;
const password = `Smoke_${runId}_12345`;

const summary = {
  appBaseUrl,
  apiBaseUrl,
  inviteCode: '',
  username,
  sessionId: '',
  pairCode: '',
  bindings: 0,
  pluginTelemetry: false,
  adminServers: 0,
  adminEvents: 0,
  forumConnected: false,
  forumAccounts: 0,
};

async function main() {
  await checkPages(['/', '/account', '/bindings', '/bind/confirm?token=demo', '/admin']);
  await getJson('/healthz');

  const createdInvite = await postJson('/admin/invitations/batch-create', {
    count: 1,
    maxUses: 3,
    createdBy: 'smoke-test',
    remark: `smoke ${new Date().toISOString()}`,
  }, { admin: true });
  const inviteCode = createdInvite?.invitations?.[0]?.code;
  assert(inviteCode, 'admin invitation batch-create did not return a code');
  summary.inviteCode = inviteCode;

  const validation = await postJson('/invitations/validate', { code: inviteCode });
  assert(validation.valid === true, 'created invitation is not valid');

  await postJson('/auth/register', {
    username,
    email,
    password,
    inviteCode,
  });

  const login = await postJson('/auth/login', {
    login: username,
    password,
  });
  assert(login?.token, 'login did not return token');

  const me = await getJson('/me', login.token);
  assert(me?.user?.username === username, 'me endpoint returned a different user');

  await assertForumSso(login.token, me.user);

  await assertPluginReplayRejected();
  await assertPluginTelemetryAccepted();
  summary.pluginTelemetry = true;
  await assertAdminTelemetryVisible();

  const bindingSession = await createPluginBindingSession();
  summary.sessionId = bindingSession.sessionId;
  summary.pairCode = bindingSession.pairCode;

  const byToken = await getJson(`/bindings/session/by-token?token=${encodeURIComponent(bindingSession.token)}`);
  assert(sessionIdOf(byToken) === bindingSession.sessionId, 'binding lookup by token returned a different session');

  const byPairCode = await postJson('/bindings/session/by-pair-code', {
    pairCode: bindingSession.pairCode,
  });
  assert(sessionIdOf(byPairCode) === bindingSession.sessionId, 'binding lookup by pair code returned a different session');

  await postJson('/bindings/confirm', {
    sessionId: bindingSession.sessionId,
  }, login.token);

  const bindings = await getJson('/me/game-bindings', login.token);
  assert(Array.isArray(bindings) && bindings.length >= 1, 'confirmed binding was not listed on the account');
  summary.bindings = bindings.length;

  console.log(JSON.stringify({ ok: true, summary }, null, 2));
}

async function checkPages(paths) {
  for (const path of paths) {
    const response = await fetch(`${appBaseUrl}${path}`);
    assert(response.ok, `page ${path} returned ${response.status}`);
  }
}

async function createPluginBindingSession() {
  const response = await sendPluginBindingSessionRequest({
    gameUserId: `smoke-game-${runId}`,
    displayName: `Smoke ${runId}`,
  });

  return parseJsonResponse(response, 'POST /plugin/bindings/session');
}

async function assertPluginReplayRejected() {
  const request = buildPluginBindingSessionRequest({
    gameUserId: `smoke-replay-${runId}`,
    displayName: `Smoke Replay ${runId}`,
  });

  const firstResponse = await fetch(request.url, request.init);
  await parseJsonResponse(firstResponse, 'POST /plugin/bindings/session replay setup');

  const replayResponse = await fetch(request.url, request.init);
  assert(replayResponse.status === 401, `replayed plugin request returned ${replayResponse.status}, expected 401`);
}

async function assertPluginTelemetryAccepted() {
  const eventResponse = await sendPluginRequest('/api/plugin/events', {
    eventId: `smoke-event-${runId}`,
    serverId: 'mc-poc-01',
    serverCode: 'cn-mc-01',
    eventType: 'player_join',
    playerUuid: `smoke-player-${runId}`,
    displayName: `Smoke ${runId}`,
    occurredAt: new Date().toISOString(),
    metadata: { source: 'smoke' },
  });
  const event = await parseJsonResponse(eventResponse, 'POST /plugin/events');
  assert(event?.ok === true, 'plugin event endpoint did not return ok');

  const heartbeatResponse = await sendPluginRequest('/api/game-servers/heartbeat', {
    statusId: `smoke-heartbeat-${runId}`,
    serverId: 'mc-poc-01',
    serverCode: 'cn-mc-01',
    healthy: true,
    onlineCount: 1,
    queueDepth: 0,
    sentAt: new Date().toISOString(),
    metadata: { source: 'smoke' },
  });
  const heartbeat = await parseJsonResponse(heartbeatResponse, 'POST /game-servers/heartbeat');
  assert(heartbeat?.ok === true, 'game server heartbeat endpoint did not return ok');
}

async function assertAdminTelemetryVisible() {
  const servers = await getJson('/admin/game-servers', { admin: true });
  assert(Array.isArray(servers) && servers.length >= 1, 'admin game servers endpoint returned no servers');
  summary.adminServers = servers.length;

  const events = await getJson(`/admin/plugin-events?serverCode=cn-mc-01&player=${encodeURIComponent(`smoke-player-${runId}`)}`, { admin: true });
  assert(Array.isArray(events) && events.length >= 1, 'admin plugin events endpoint returned no matching events');
  summary.adminEvents = events.length;

  const forum = await getJson('/admin/forum/summary', { admin: true });
  assert(forum?.counts?.accounts >= 1, 'admin forum summary did not include forum accounts');
  summary.forumAccounts = forum.counts.accounts;
}

async function assertForumSso(token, user) {
  const unauthenticated = await fetch(`${apiBaseUrl}/forum/entry`);
  assert(unauthenticated.status === 401, `unauthenticated forum entry returned ${unauthenticated.status}, expected 401`);

  const before = await getJson('/me/forum-account', token);
  assert(before?.provider === 'discourse', 'forum account status did not return discourse provider');

  const start = await getJson('/forum/sso/start', token);
  assert(start?.forumSsoUrl && start?.ticket, 'forum sso start did not return url and ticket');

  const callbackPayload = encodeForumSsoPayload({
    nonce: start.ticket,
    external_id: user.id,
    username: user.username,
    email: user.email,
    name: user.username,
  });

  const badCallback = await fetch(`${apiBaseUrl}/forum/sso/callback?sso=${encodeURIComponent(callbackPayload)}&sig=bad`);
  assert(badCallback.status === 401, `bad forum callback returned ${badCallback.status}, expected 401`);

  const callbackSig = signForumSsoPayload(callbackPayload, forumSsoSecret);
  const callback = await getJson(`/forum/sso/callback?sso=${encodeURIComponent(callbackPayload)}&sig=${callbackSig}`);
  assert(callback?.ok === true, 'forum callback did not return ok');
  assert(callback?.account?.forumUsername === user.username, 'forum callback mapped a different username');

  const after = await getJson('/me/forum-account', token);
  assert(after?.connected === true, 'forum account status is not connected after callback');
  summary.forumConnected = true;
}

async function sendPluginBindingSessionRequest(params) {
  const request = buildPluginBindingSessionRequest(params);
  return fetch(request.url, request.init);
}

function sendPluginRequest(path, payload) {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomUUID();
  const signature = signPluginRequest({
    method: 'POST',
    path,
    timestamp,
    nonce,
    body,
  }, pluginClientSecret);

  return fetch(`${apiBaseUrl}${path.replace(/^\/api/, '')}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-gm-client-key': pluginClientKey,
      'x-gm-timestamp': timestamp,
      'x-gm-nonce': nonce,
      'x-gm-signature': signature,
    },
    body,
  });
}

function buildPluginBindingSessionRequest(params) {
  const body = JSON.stringify({
    serverCode: 'cn-mc-01',
    gameCode: 'minecraft',
    platform: 'java',
    gameUserId: params.gameUserId,
    displayName: params.displayName,
    bindMode: 'bind_existing',
  });

  const path = '/api/plugin/bindings/session';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomUUID();
  const signature = signPluginRequest({
    method: 'POST',
    path,
    timestamp,
    nonce,
    body,
  }, pluginClientSecret);

  return {
    url: `${apiBaseUrl}/plugin/bindings/session`,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-gm-client-key': pluginClientKey,
        'x-gm-timestamp': timestamp,
        'x-gm-nonce': nonce,
        'x-gm-signature': signature,
      },
      body,
    },
  };
}

async function getJson(path, options) {
  const token = typeof options === 'string' ? options : undefined;
  const admin = typeof options === 'object' && options?.admin;
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(admin ? { 'x-gm-admin-key': adminApiKey } : {}),
    },
  });
  return parseJsonResponse(response, `GET ${path}`);
}

async function postJson(path, body, options) {
  const token = typeof options === 'string' ? options : options?.token;
  const admin = typeof options === 'object' && options?.admin;
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(admin ? { 'x-gm-admin-key': adminApiKey } : {}),
    },
    body: JSON.stringify(body),
  });
  return parseJsonResponse(response, `POST ${path}`);
}

async function parseJsonResponse(response, label) {
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  assert(response.ok, `${label} returned ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

function signPluginRequest(input, secret) {
  const bodyHash = createHash('sha256').update(input.body || '').digest('hex');
  const payload = [
    input.method.toUpperCase(),
    input.path,
    input.timestamp,
    input.nonce,
    bodyHash,
  ].join('\n');

  return createHmac('sha256', secret).update(payload).digest('hex');
}

function encodeForumSsoPayload(params) {
  return Buffer.from(new URLSearchParams(params).toString(), 'utf8').toString('base64');
}

function signForumSsoPayload(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function sessionIdOf(value) {
  return value?.sessionId || value?.id;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(error);
  console.log(JSON.stringify({ ok: false, summary }, null, 2));
  process.exit(1);
});
