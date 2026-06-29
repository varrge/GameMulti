import { createHash, createHmac, randomUUID } from 'node:crypto';

const appBaseUrl = stripTrailingSlash(process.env.APP_BASE_URL || 'http://127.0.0.1:8080');
const apiBaseUrl = stripTrailingSlash(process.env.API_BASE_URL || `${appBaseUrl}/api`);
const forumOrigin = stripTrailingSlash(process.env.FORUM_ORIGIN || 'http://localhost');
const pluginClientKey = process.env.PLUGIN_CLIENT_KEY || 'demo-client';
const pluginClientSecret = process.env.PLUGIN_CLIENT_SECRET || 'demo-secret';
const discourseProviderSecret = process.env.DISCOURSE_PROVIDER_SECRET
  || process.env.FORUM_SSO_SECRET
  || 'local-dev-forum-sso-secret';

const runId = Date.now().toString(36);
const externalId = `dc-smoke-${runId}`;
const username = `dc_smoke_${runId}`;
const gameUserId = `bridge-smoke-${runId}`;

const cookieJar = new Map();

const summary = {
  appBaseUrl,
  apiBaseUrl,
  externalId,
  username,
  gameUserId,
  sessionId: '',
};

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  await fetchOk(`${appBaseUrl}/`, 'Bridge root');
  await getJson('/healthz');

  const session = await createPluginBindingSession();
  summary.sessionId = session.sessionId;
  assert(
    session.publicBindUrl === `${appBaseUrl}/bind/confirm?token=${session.token}`,
    `unexpected publicBindUrl: ${session.publicBindUrl}`,
  );

  const unauthenticated = await fetchWithCookies(`${appBaseUrl}/bind/confirm?token=${encodeURIComponent(session.token)}`, {
    redirect: 'manual',
  });
  assert(unauthenticated.status === 302, `unauthenticated bind page returned ${unauthenticated.status}, expected 302`);
  const loginPath = unauthenticated.headers.get('location');
  assert(String(loginPath || '').startsWith('/api/auth/discourse/start?'), `unexpected login redirect: ${loginPath}`);

  const start = await fetchWithCookies(new URL(loginPath, appBaseUrl).toString(), {
    redirect: 'manual',
  });
  assert(start.status === 302, `discourse start returned ${start.status}, expected 302`);
  const discourseUrl = new URL(start.headers.get('location'));
  assert(
    discourseUrl.origin === forumOrigin && discourseUrl.pathname === '/session/sso_provider',
    `unexpected discourse provider url: ${discourseUrl.toString()}`,
  );

  const requestPayload = discourseUrl.searchParams.get('sso');
  const requestSig = discourseUrl.searchParams.get('sig');
  assert(requestPayload && requestSig, 'missing discourse provider request payload');
  assert(
    signPayload(requestPayload, discourseProviderSecret) === requestSig,
    'Bridge signed Discourse provider request with an unexpected secret',
  );

  const requestParams = decodePayload(requestPayload);
  assert(requestParams.nonce, 'provider request did not include nonce');
  assert(requestParams.return_sso_url, 'provider request did not include return_sso_url');

  const callbackPayload = encodePayload({
    nonce: requestParams.nonce,
    external_id: externalId,
    username,
    email: `${username}@example.test`,
    name: username,
  });
  const callbackSig = signPayload(callbackPayload, discourseProviderSecret);
  const callbackUrl = new URL(requestParams.return_sso_url);
  callbackUrl.searchParams.set('sso', callbackPayload);
  callbackUrl.searchParams.set('sig', callbackSig);

  const callback = await fetchWithCookies(callbackUrl.toString(), { redirect: 'manual' });
  assert(callback.status === 302, `discourse callback returned ${callback.status}, expected 302`);
  assert(
    callback.headers.get('location') === `/bind/confirm?token=${session.token}`,
    `callback returned unexpected location: ${callback.headers.get('location')}`,
  );

  const confirmPage = await fetchWithCookies(`${appBaseUrl}/bind/confirm?token=${encodeURIComponent(session.token)}`);
  const confirmHtml = await confirmPage.text();
  assert(confirmPage.ok, `authenticated bind page returned ${confirmPage.status}`);
  assert(confirmHtml.includes(username), 'bind page did not render the Discourse username');

  const submitted = await fetchWithCookies(`${appBaseUrl}/bind/confirm`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      token: session.token,
      sessionId: session.sessionId,
    }),
  });
  const submittedHtml = await submitted.text();
  assert(submitted.ok, `bind submit returned ${submitted.status}: ${submittedHtml.slice(0, 200)}`);
  assert(submittedHtml.includes('绑定完成'), 'bind submit did not render success');

  console.log(JSON.stringify({ ok: true, summary }, null, 2));
}

async function createPluginBindingSession() {
  const response = await sendPluginRequest('/api/plugin/bindings/session', {
    serverCode: 'cn-mc-01',
    gameCode: 'minecraft',
    platform: 'java',
    gameUserId,
    displayName: `Bridge Smoke ${runId}`,
    bindMode: 'bind_existing',
  });
  return parseJson(response, 'POST /plugin/bindings/session');
}

async function sendPluginRequest(path, payload) {
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

async function getJson(path) {
  return parseJson(await fetch(`${apiBaseUrl}${path}`), `GET ${path}`);
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

async function fetchOk(url, label) {
  const response = await fetch(url);
  assert(response.ok, `${label} returned ${response.status}`);
}

async function fetchWithCookies(url, init = {}) {
  const headers = new Headers(init.headers || {});
  const cookie = cookieHeader();
  if (cookie) {
    headers.set('cookie', cookie);
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });
  storeCookies(response.headers);
  return response;
}

function storeCookies(headers) {
  const values = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : splitSetCookie(headers.get('set-cookie'));

  for (const value of values) {
    const pair = value.split(';')[0];
    const index = pair.indexOf('=');
    if (index > 0) {
      cookieJar.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }
}

function splitSetCookie(value) {
  if (!value) {
    return [];
  }
  return value.split(/,(?=\s*[^;,]+=)/g);
}

function cookieHeader() {
  return Array.from(cookieJar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
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

function encodePayload(params) {
  return Buffer.from(new URLSearchParams(params).toString(), 'utf8').toString('base64');
}

function decodePayload(payload) {
  return Object.fromEntries(new URLSearchParams(Buffer.from(payload, 'base64').toString('utf8')));
}

function signPayload(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
