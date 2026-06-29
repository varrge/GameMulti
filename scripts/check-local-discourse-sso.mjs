const appBaseUrl = stripTrailingSlash(process.env.APP_BASE_URL || 'http://127.0.0.1:8080');
const apiBaseUrl = stripTrailingSlash(process.env.API_BASE_URL || `${appBaseUrl}/api`);
const discourseBaseUrl = stripTrailingSlash(process.env.DISCOURSE_BASE_URL || 'http://localhost');

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const discourseState = await inspectDiscourse();
  assert(
    discourseState.legacyClientRedirect === false,
    `forum login is still delegated to GameMulti: ${discourseState.legacyClientLocation}`,
  );

  await getJson('/healthz');
  await fetchOk(`${appBaseUrl}/`, 'GameMulti Bridge root');

  const start = await fetch(`${apiBaseUrl}/auth/discourse/start?returnTo=/bind/confirm?token=local-check`, {
    redirect: 'manual',
  });
  assert(start.status === 302, `Bridge discourse start returned ${start.status}, expected 302`);
  const location = start.headers.get('location') || '';
  const expectedPrefix = `${discourseBaseUrl}/session/sso_provider?`;
  assert(
    location.startsWith(expectedPrefix),
    `Bridge did not point to local Discourse provider: ${location}`,
  );

  console.log(JSON.stringify({
    ok: true,
    appBaseUrl,
    discourseBaseUrl,
    discourseState,
    providerSsoUrlPrefix: location.slice(0, expectedPrefix.length + 12),
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

  const legacyClientProbe = await fetch(`${discourseBaseUrl}/session/sso?return_path=%2F`, {
    redirect: 'manual',
  });
  const legacyClientLocation = legacyClientProbe.headers.get('location') || '';
  const legacyClientRedirect = legacyClientLocation.startsWith(`${appBaseUrl}/forums/discourse-connect`);

  const providerProbe = await fetch(`${discourseBaseUrl}/session/sso_provider?sso=probe&sig=probe`, {
    redirect: 'manual',
  });

  let providerEndpointState = 'reachable';
  if (providerProbe.status === 404) {
    providerEndpointState = 'not_found_until_provider_enabled';
  } else if (providerProbe.status >= 300 && providerProbe.status < 400) {
    providerEndpointState = 'redirected';
  } else if (providerProbe.status >= 400) {
    providerEndpointState = `http_${providerProbe.status}`;
  }

  return {
    setupRequired,
    legacyClientRedirect,
    legacyClientLocation,
    providerEndpointState,
  };
}

async function getJson(path, token) {
  return parseJson(await fetch(`${apiBaseUrl}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
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
