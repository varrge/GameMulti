const appBaseUrl = stripTrailingSlash(process.env.APP_BASE_URL || 'http://127.0.0.1:8080');
const apiBaseUrl = stripTrailingSlash(process.env.API_BASE_URL || `${appBaseUrl}/api`);
const discourseBaseUrl = stripTrailingSlash(process.env.DISCOURSE_BASE_URL || 'http://127.0.0.1:3000');
const adminApiKey = process.env.ADMIN_API_KEY || 'local-dev-admin-key';

const runId = Date.now().toString(36);
const username = `forumlocal_${runId}`;
const email = `${username}@example.test`;
const password = `LocalForum_${runId}_12345`;

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  await fetchOk(`${discourseBaseUrl}/`, 'local Discourse');
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
  const expectedPrefix = `${discourseBaseUrl}/session/sso_login?`;
  assert(
    String(start?.forumSsoUrl || '').startsWith(expectedPrefix),
    `forumSsoUrl did not point to local Discourse: ${start?.forumSsoUrl}`,
  );

  console.log(JSON.stringify({
    ok: true,
    appBaseUrl,
    discourseBaseUrl,
    username,
    provider: start.provider,
    forumSsoUrlPrefix: start.forumSsoUrl.slice(0, expectedPrefix.length + 12),
  }, null, 2));
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
