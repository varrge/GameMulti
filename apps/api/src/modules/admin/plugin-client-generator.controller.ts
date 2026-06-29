import { Controller, Get, Header } from '@nestjs/common';

@Controller('admin/plugin-client-generator')
export class PluginClientGeneratorController {
  @Get()
  @Header('content-type', 'text/html; charset=utf-8')
  page() {
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Plugin Client Generator - GameMulti</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; background: #080808; color: #fff; display: grid; place-items: center; padding: 24px; }
    main { width: min(100%, 760px); border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.045); padding: 28px; }
    h1 { margin: 0 0 20px; font-size: clamp(28px, 6vw, 44px); line-height: 1; text-transform: uppercase; }
    label { display: grid; gap: 8px; margin: 14px 0; color: rgba(255,255,255,.72); font-size: 13px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    input, select, textarea { box-sizing: border-box; width: 100%; border: 1px solid rgba(255,255,255,.18); background: rgba(0,0,0,.35); color: #fff; padding: 12px; font: inherit; }
    textarea { min-height: 180px; resize: vertical; }
    .row { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: end; }
    button { border: 0; background: #f27d26; color: #000; padding: 13px 18px; font-weight: 900; cursor: pointer; text-transform: uppercase; }
    button.secondary { background: rgba(255,255,255,.14); color: #fff; }
    button:disabled { opacity: .45; cursor: not-allowed; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
    .message { margin-top: 16px; color: rgba(255,255,255,.68); line-height: 1.6; }
    .error { color: #ff8888; }
  </style>
</head>
<body>
  <main>
    <h1>Plugin Client</h1>
    <label>
      Admin Key
      <input id="adminKey" type="password" autocomplete="off" />
    </label>
    <label>
      Install Token Hours
      <input id="installTokenHours" type="number" min="1" max="720" value="24" />
    </label>
    <div class="actions">
      <button id="createInstallToken" type="button">生成安装令牌</button>
      <button class="secondary" id="copyInstallToken" type="button" disabled>复制安装配置</button>
    </div>
    <label>
      Install Config
      <textarea id="installTokenResult" readonly placeholder="给服主第一次安装插件用，只显示一次 installToken"></textarea>
    </label>
    <div class="row">
      <label>
        Server
        <select id="serverCode">
          <option value="">先加载服务器</option>
        </select>
      </label>
      <button class="secondary" id="loadServers" type="button">加载</button>
    </div>
    <label>
      Plugin Version
      <input id="pluginVersion" value="temporary" />
    </label>
    <label>
      Protocol Version
      <input id="protocolVersion" value="2026-06-mvp" />
    </label>
    <label>
      Expires In Hours
      <input id="expiresInHours" type="number" min="0" max="720" value="24" />
    </label>
    <div class="actions">
      <button id="createClient" type="button">生成凭证</button>
      <button class="secondary" id="copyConfig" type="button" disabled>复制配置</button>
    </div>
    <p id="message" class="message"></p>
    <div id="servers"></div>
    <label>
      Config
      <textarea id="result" readonly placeholder="生成后这里只显示一次 clientSecret"></textarea>
    </label>
  </main>
  <script>
    const adminKey = document.querySelector('#adminKey');
    const installTokenHours = document.querySelector('#installTokenHours');
    const installTokenResult = document.querySelector('#installTokenResult');
    const copyInstallToken = document.querySelector('#copyInstallToken');
    const serverCode = document.querySelector('#serverCode');
    const pluginVersion = document.querySelector('#pluginVersion');
    const protocolVersion = document.querySelector('#protocolVersion');
    const expiresInHours = document.querySelector('#expiresInHours');
    const result = document.querySelector('#result');
    const servers = document.querySelector('#servers');
    const message = document.querySelector('#message');
    const copyConfig = document.querySelector('#copyConfig');

    function setMessage(text, error) {
      message.textContent = text || '';
      message.className = error ? 'message error' : 'message';
    }

    async function adminRequest(path, options = {}) {
      const key = adminKey.value.trim();
      if (!key) throw new Error('Admin Key required');

      const response = await fetch('/api' + path, {
        ...options,
        headers: {
          'content-type': 'application/json',
          'x-gm-admin-key': key,
          ...(options.headers || {}),
        },
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : null;
      if (!response.ok) {
        throw new Error(data?.message || 'Request failed');
      }
      return data;
    }

    document.querySelector('#loadServers').addEventListener('click', async () => {
      try {
        setMessage('Loading servers...');
        const servers = await adminRequest('/admin/game-servers');
        renderServers(servers);
        serverCode.innerHTML = '';
        for (const server of servers) {
          const option = document.createElement('option');
          option.value = server.serverCode;
          option.textContent = server.serverName + ' / ' + server.serverCode;
          serverCode.appendChild(option);
        }
        setMessage(servers.length ? 'Servers loaded.' : 'No servers found.');
      } catch (error) {
        setMessage(error.message, true);
      }
    });

    function renderServers(items) {
      servers.innerHTML = items.map((server) => [
        '<div style="border-top:1px solid rgba(255,255,255,.1);padding:12px 0;display:grid;gap:8px">',
        '<strong>' + escapeHtml(server.serverName) + ' / ' + escapeHtml(server.serverCode) + '</strong>',
        '<span class="message">status=' + escapeHtml(server.status) + ' host=' + escapeHtml(server.endpointHost || '-') + ':' + escapeHtml(String(server.endpointPort || '-')) + ' online=' + escapeHtml(String(server.latestHeartbeat?.onlineCount ?? '-')) + '</span>',
        '<div class="actions">',
        '<button class="secondary" data-status="active" data-id="' + escapeHtml(server.id) + '">通过</button>',
        '<button class="secondary" data-status="disabled" data-id="' + escapeHtml(server.id) + '">禁用</button>',
        '<button class="secondary" data-status="blocked" data-id="' + escapeHtml(server.id) + '">拉黑</button>',
        '</div>',
        '</div>',
      ].join('')).join('');
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[ch]));
    }

    servers.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-status]');
      if (!button) return;
      try {
        await adminRequest('/admin/game-servers/' + encodeURIComponent(button.dataset.id) + '/status', {
          method: 'POST',
          body: JSON.stringify({ status: button.dataset.status }),
        });
        setMessage('Server status updated.');
        document.querySelector('#loadServers').click();
      } catch (error) {
        setMessage(error.message, true);
      }
    });

    document.querySelector('#createInstallToken').addEventListener('click', async () => {
      try {
        setMessage('Creating install token...');
        const data = await adminRequest('/admin/plugin-install-tokens', {
          method: 'POST',
          body: JSON.stringify({
            gameCode: 'minecraft',
            expiresInHours: Number(installTokenHours.value || 24),
          }),
        });
        installTokenResult.value = [
          'apiBaseUrl: "' + location.origin + '"',
          'installToken: "' + data.installToken + '"',
          'serverName: "你的服务器名"',
          'publicHost: "你的服务器公网IP或域名"',
          'publicPort: 25565',
          'expiresAt: "' + data.expiresAt + '"',
        ].join('\\n');
        copyInstallToken.disabled = false;
        setMessage('Install token created. It is shown once.');
      } catch (error) {
        setMessage(error.message, true);
      }
    });

    copyInstallToken.addEventListener('click', async () => {
      await navigator.clipboard.writeText(installTokenResult.value);
      setMessage('Copied.');
    });

    document.querySelector('#createClient').addEventListener('click', async () => {
      try {
        setMessage('Creating plugin client...');
        const data = await adminRequest('/admin/plugin-clients', {
          method: 'POST',
          body: JSON.stringify({
            serverCode: serverCode.value,
            pluginVersion: pluginVersion.value,
            protocolVersion: protocolVersion.value,
            expiresInHours: expiresInHours.value === '' ? undefined : Number(expiresInHours.value),
          }),
        });
        result.value = [
          'apiBaseUrl: "' + data.bridgePublicOrigin + '"',
          'serverCode: "' + data.server.serverCode + '"',
          'gameCode: "' + data.server.gameCode + '"',
          'clientKey: "' + data.pluginClient.clientKey + '"',
          'clientSecret: "' + data.pluginClient.clientSecret + '"',
          'expiresAt: "' + (data.pluginClient.expiresAt || 'never') + '"',
        ].join('\\n');
        copyConfig.disabled = false;
        setMessage('Created. clientSecret will not be returned again after this response.');
      } catch (error) {
        setMessage(error.message, true);
      }
    });

    copyConfig.addEventListener('click', async () => {
      await navigator.clipboard.writeText(result.value);
      setMessage('Copied.');
    });
  </script>
</body>
</html>`;
  }
}
