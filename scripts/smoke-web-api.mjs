import { createHash, createHmac, randomUUID } from 'node:crypto';

const appBaseUrl = stripTrailingSlash(process.env.APP_BASE_URL || 'http://127.0.0.1:8080');
const apiBaseUrl = stripTrailingSlash(process.env.API_BASE_URL || `${appBaseUrl}/api`);

const pluginClientKey = process.env.PLUGIN_CLIENT_KEY || 'demo-client';
const pluginClientSecret = process.env.PLUGIN_CLIENT_SECRET || 'demo-secret';

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
};

async function main() {
  await checkPages(['/', '/account', '/bindings', '/bind/confirm?token=demo']);
  await getJson('/healthz');

  const createdInvite = await postJson('/admin/invitations/batch-create', {
    count: 1,
    maxUses: 3,
    createdBy: 'smoke-test',
    remark: `smoke ${new Date().toISOString()}`,
  });
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
  const body = JSON.stringify({
    serverCode: 'cn-mc-01',
    gameCode: 'minecraft',
    platform: 'java',
    gameUserId: `smoke-game-${runId}`,
    displayName: `Smoke ${runId}`,
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

  const response = await fetch(`${apiBaseUrl}/plugin/bindings/session`, {
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

  return parseJsonResponse(response, 'POST /plugin/bindings/session');
}

async function getJson(path, token) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
  return parseJsonResponse(response, `GET ${path}`);
}

async function postJson(path, body, token) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
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
