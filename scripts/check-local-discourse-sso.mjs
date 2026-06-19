import { createHmac } from 'node:crypto';

const appBaseUrl = stripTrailingSlash(process.env.APP_BASE_URL || 'http://127.0.0.1:8080');
const apiBaseUrl = stripTrailingSlash(process.env.API_BASE_URL || `${appBaseUrl}/api`);
const discourseBaseUrl = stripTrailingSlash(process.env.DISCOURSE_BASE_URL || 'http://127.0.0.1:3000');
const adminApiKey = process.env.ADMIN_API_KEY || 'local-dev-admin-key';
const forumSsoSecret = process.env.FORUM_SSO_SECRET || 'local-dev-forum-sso-secret';

const runId = Date.now().toString(36);
const username = `forumlocal_${runId}`;
const email = `${username}@example.test`;
const password = `LocalForum_${runId}_12345`;

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const discourseState = await inspectDiscourse();
  await getJson('/healthz');
  await fetchOk(`${appBaseUrl}/forums`, 'GameMulti /forums');

  const createdInvite = await postJson('/admin/invitations/batch-create', {
    count: 1,
    maxUses: 1,
    createdBy: 'local-discourse-check',
    remark: `local discourse check ${new Date().toISOString()}`,
  }, { admin: true });

  const inviteCode = createdInvite?.invitations?.[0]?.code;
  assert(inviteCode, 'admin invitation batch-create did not return a code');

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

  const start = await getJson('/forum/sso/start', login.token);
  const expectedPrefix = `${discourseBaseUrl}/session/sso?`;
  assert(
    String(start?.forumSsoUrl || '').startsWith(expectedPrefix),
    `forumSsoUrl did not point to local Discourse: ${start?.forumSsoUrl}`,
  );

  const discoursePayload = encodeDiscoursePayload({
    nonce: `local_discourse_nonce_${runId}`,
    return_sso_url: `${discourseBaseUrl}/session/sso_login`,
  });
  const discourseSig = signDiscoursePayload(discoursePayload, forumSsoSecret);
  const authorize = await getJson(
    `/forum/sso/authorize?sso=${encodeURIComponent(discoursePayload)}&sig=${encodeURIComponent(discourseSig)}`,
    login.token,
  );
  const returnPrefix = `${discourseBaseUrl}/session/sso_login?`;
  assert(
    String(authorize?.redirectUrl || '').startsWith(returnPrefix),
    `authorize redirectUrl did not point back to local Discourse: ${authorize?.redirectUrl}`,
  );

  console.log(JSON.stringify({
    ok: true,
    appBaseUrl,
    discourseBaseUrl,
    username,
    provider: start.provider,
    discourseState,
    forumSsoUrlPrefix: start.forumSsoUrl.slice(0, expectedPrefix.length + 12),
    authorizeRedirectPrefix: authorize.redirectUrl.slice(0, returnPrefix.length + 12),
  }, null, 2));
}

async function inspectDiscourse() {
  const response = await fetch(`${discourseBaseUrl}/`);
  const text = await response.text();
  assert(response.ok, `local Discourse returned ${response.status}`);

  const lower = text.toLowerCase();
  const setupRequired =
    lower.includes('wizard') ||
    lower.includes('finish_installation') ||
    lower.includes('congratulations, you installed discourse');

  const ssoProbe = await fetch(`${discourseBaseUrl}/session/sso_login?sso=probe&sig=probe`, {
    redirect: 'manual',
  });

  let ssoEndpointState = 'reachable';
  if (ssoProbe.status === 404) {
    ssoEndpointState = 'not_found_until_discourseconnect_enabled';
  } else if (ssoProbe.status >= 300 && ssoProbe.status < 400) {
    ssoEndpointState = 'redirected';
  } else if (ssoProbe.status >= 400) {
    ssoEndpointState = `http_${ssoProbe.status}`;
  }

  return {
    setupRequired,
    ssoEndpointState,
  };
}

async function getJson(path, token) {
  return parseJson(await fetch(`${apiBaseUrl}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  }), path);
}

async function postJson(path, body, options = {}) {
  return parseJson(await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(options.admin ? { 'x-gm-admin-key': adminApiKey } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: JSON.stringify(body),
  }), path);
}

async function parseJson(response, label) {
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    throw new Error(`${label} returned ${response.status}: ${text}`);
  }
  return body;
}

async function fetchOk(url, label) {
  const response = await fetch(url, { method: 'HEAD' });
  assert(response.ok, `${label} returned ${response.status}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function encodeDiscoursePayload(params) {
  return Buffer.from(new URLSearchParams(params).toString(), 'utf8').toString('base64');
}

function signDiscoursePayload(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}
