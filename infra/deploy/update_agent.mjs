#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '../..');
const updateScript = join(scriptDir, 'update.sh');
const host = process.env.DEPLOY_AGENT_HOST || '127.0.0.1';
const port = Number(process.env.DEPLOY_AGENT_PORT || 3421);
const token = process.env.DEPLOY_AGENT_TOKEN || '';
const maxLogChars = Number(process.env.DEPLOY_AGENT_MAX_LOG_CHARS || 20000);

if (!token || token.startsWith('replace-with-')) {
  console.error('DEPLOY_AGENT_TOKEN is required');
  process.exit(1);
}

const state = {
  running: false,
  startedAt: null,
  finishedAt: null,
  exitCode: null,
  lastError: null,
  logs: '',
};

function appendLog(chunk) {
  state.logs = `${state.logs}${chunk}`;
  if (state.logs.length > maxLogChars) {
    state.logs = state.logs.slice(-maxLogChars);
  }
}

function json(response, statusCode, data) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

function authorized(request) {
  const provided = String(request.headers['x-gm-deploy-token'] || '');
  const expected = token;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

function publicState() {
  return {
    running: state.running,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    exitCode: state.exitCode,
    lastError: state.lastError,
    logs: state.logs,
  };
}

function startUpdate() {
  state.running = true;
  state.startedAt = new Date().toISOString();
  state.finishedAt = null;
  state.exitCode = null;
  state.lastError = null;
  state.logs = '';

  const child = spawn('bash', [updateScript], {
    cwd: repoRoot,
    env: process.env,
  });

  child.stdout.on('data', (chunk) => appendLog(chunk.toString()));
  child.stderr.on('data', (chunk) => appendLog(chunk.toString()));
  child.on('error', (error) => {
    state.lastError = error.message;
    appendLog(`${error.message}\n`);
  });
  child.on('close', (code) => {
    state.running = false;
    state.finishedAt = new Date().toISOString();
    state.exitCode = code;
  });
}

createServer((request, response) => {
  if (request.url === '/healthz') {
    json(response, 200, { ok: true });
    return;
  }

  if (!authorized(request)) {
    json(response, 401, { message: 'Unauthorized' });
    return;
  }

  if (request.method === 'GET' && request.url === '/status') {
    json(response, 200, publicState());
    return;
  }

  if (request.method === 'POST' && request.url === '/update') {
    if (state.running) {
      json(response, 409, { message: 'Update already running', ...publicState() });
      return;
    }
    startUpdate();
    json(response, 202, { message: 'Update started', ...publicState() });
    return;
  }

  json(response, 404, { message: 'Not found' });
}).listen(port, host, () => {
  console.log(`GameMulti update agent listening on http://${host}:${port}`);
});
