import { createHash, createHmac, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

loadLocalEnv();

const appBaseUrl = stripTrailingSlash(process.env.APP_BASE_URL || 'http://127.0.0.1:8080');
const apiBaseUrl = stripTrailingSlash(process.env.API_BASE_URL || `${appBaseUrl}/api`);
const adminApiKey = process.env.ADMIN_API_KEY;

const runId = Date.now().toString(36);
const serverCode = `install-smoke-${runId}`;

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  assert(adminApiKey, 'ADMIN_API_KEY is required');

  const installToken = await postAdmin('/admin/plugin-install-tokens', {
    gameCode: 'minecraft',
    expiresInHours: 1,
  });

  const claim = await post('/plugin/installations/claim', {
    installToken: installToken.installToken,
    serverCode,
    serverName: 'Install Smoke Server',
    publicHost: 'mc-smoke.example.test',
    publicPort: 25565,
    pluginVersion: 'smoke',
    protocolVersion: '2026-06-mvp',
  });
  assert(claim.server.status === 'pending', `expected pending server, got ${claim.server.status}`);

  const pendingHeartbeat = await postPlugin('/game-servers/heartbeat', heartbeatPayload(), claim);
  assert(pendingHeartbeat.status === 401, `pending heartbeat returned ${pendingHeartbeat.status}, expected 401`);

  const servers = await getAdmin('/admin/game-servers');
  const server = servers.find((item) => item.serverCode === serverCode);
  assert(server, 'claimed server not found in admin server list');

  await postAdmin(`/admin/game-servers/${encodeURIComponent(server.id)}/status`, { status: 'active' });

  const activeHeartbeat = await postPlugin('/game-servers/heartbeat', heartbeatPayload(), claim);
  const activeBody = await parseJson(activeHeartbeat, 'active heartbeat');
  assert(activeBody.ok === true, 'active heartbeat did not return ok=true');

  await postAdmin(`/admin/game-servers/${encodeURIComponent(server.id)}/status`, { status: 'blocked' });

  const blockedHeartbeat = await postPlugin('/game-servers/heartbeat', heartbeatPayload(), claim);
  assert(blockedHeartbeat.status === 401, `blocked heartbeat returned ${blockedHeartbeat.status}, expected 401`);

  console.log(JSON.stringify({
    ok: true,
    appBaseUrl,
    serverCode,
    claimStatus: claim.server.status,
    pendingHeartbeatStatus: pendingHeartbeat.status,
    activeHeartbeatOk: activeBody.ok,
    blockedHeartbeatStatus: blockedHeartbeat.status,
  }, null, 2));
}

function heartbeatPayload() {
  return {
    statusId: `status-${randomBytes(4).toString('hex')}`,
    serverCode,
    healthy: true,
    onlineCount: 3,
    queueDepth: 0,
    sentAt: new Date().toISOString(),
    metadata: {
      publicHost: 'mc-smoke.example.test',
      publicPort: 25565,
    },
  };
}

async function getAdmin(path) {
  return parseJson(await fetch(`${apiBaseUrl}${path}`, {
    headers: { 'x-gm-admin-key': adminApiKey },
  }), `GET ${path}`);
}

async function postAdmin(path, body) {
  return parseJson(await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-gm-admin-key': adminApiKey,
    },
    body: JSON.stringify(body),
  }), `POST ${path}`);
}

async function post(path, body) {
  return parseJson(await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }), `POST ${path}`);
}

async function postPlugin(path, body, claim) {
  const apiPath = `/api${path}`;
  const serialized = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString('hex');

  return fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-gm-client-key': claim.pluginClient.clientKey,
      'x-gm-timestamp': timestamp,
      'x-gm-nonce': nonce,
      'x-gm-signature': signPluginRequest({
        method: 'POST',
        path: apiPath,
        timestamp,
        nonce,
        body: serialized,
      }, claim.pluginClient.clientSecret),
    },
    body: serialized,
  });
}

async function parseJson(response, label) {
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  assert(response.ok, `${label} returned ${response.status}: ${text}`);
  return body;
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

function loadLocalEnv() {
  const envFile = process.env.SMOKE_ENV_FILE || 'infra/compose/.env';
  if (!existsSync(envFile)) {
    return;
  }

  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) {
      continue;
    }
    const index = line.indexOf('=');
    const key = line.slice(0, index);
    if (process.env[key]) {
      continue;
    }
    process.env[key] = line.slice(index + 1).replace(/^"|"$/g, '');
  }
}

function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
