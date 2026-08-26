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
  <title>GameMulti 插件客户端管理</title>
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
    h2 { margin: 26px 0 12px; font-size: 18px; text-transform: uppercase; }
  </style>
</head>
<body>
  <main>
    <h1>插件客户端管理</h1>
    <label>
      管理员密钥
      <input id="adminKey" type="password" autocomplete="off" />
    </label>
    <label>
      安装令牌有效期（小时）
      <input id="installTokenHours" type="number" min="1" max="720" value="24" />
    </label>
    <div class="actions">
      <button id="createInstallToken" type="button">生成安装令牌</button>
      <button class="secondary" id="copyInstallToken" type="button" disabled>复制安装配置</button>
    </div>
    <label>
      安装配置
      <textarea id="installTokenResult" readonly placeholder="给服主第一次安装插件用，只显示一次 installToken"></textarea>
    </label>
    <div class="row">
      <label>
        服务器
        <select id="serverCode">
          <option value="">先加载服务器</option>
        </select>
      </label>
      <button class="secondary" id="loadServers" type="button">加载</button>
    </div>
    <label>
      插件版本
      <input id="pluginVersion" value="temporary" />
    </label>
    <label>
      协议版本
      <input id="protocolVersion" value="2026-06-mvp" />
    </label>
    <label>
      凭证有效期（小时，0 表示永不过期）
      <input id="expiresInHours" type="number" min="0" max="720" value="24" />
    </label>
    <div class="actions">
      <button id="createClient" type="button">生成凭证</button>
      <button class="secondary" id="copyConfig" type="button" disabled>复制配置</button>
    </div>
    <p id="message" class="message"></p>
    <div id="servers"></div>
    <label>
      客户端配置
      <textarea id="result" readonly placeholder="生成后这里只显示一次 clientSecret"></textarea>
    </label>
    <h2>部署更新</h2>
    <div class="actions">
      <button class="secondary" id="loadDeployStatus" type="button">更新状态</button>
      <button id="triggerDeployUpdate" type="button">一键更新</button>
    </div>
    <label>
      部署状态
      <textarea id="deployStatus" readonly placeholder="未配置更新代理时，这里会显示“未启用”"></textarea>
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
    const deployStatus = document.querySelector('#deployStatus');
    let deployPollTimer;

    const statusLabels = {
      active: '正常',
      pending: '待审核',
      disabled: '已禁用',
      blocked: '已拉黑',
      healthy: '健康',
      unhealthy: '异常',
      running: '运行中',
      success: '成功',
      failed: '失败',
      idle: '空闲',
    };

    function statusLabel(value) {
      return statusLabels[value] || '未知';
    }

    function deployMessage(value) {
      const labels = {
        'DEPLOY_AGENT_URL and DEPLOY_AGENT_TOKEN are not configured': '未配置部署更新代理。',
        'Update already running': '部署更新正在进行中。',
        'Update started': '部署更新已开始。',
      };
      return labels[value] || (/[\u4e00-\u9fff]/.test(value || '') ? value : '部署状态已更新。');
    }

    function errorMessage(error) {
      return error instanceof Error && /[\u4e00-\u9fff]/.test(error.message)
        ? error.message
        : '操作失败，请检查网络连接和管理员密钥。';
    }

    function setMessage(text, error) {
      message.textContent = text || '';
      message.className = error ? 'message error' : 'message';
    }

    async function adminRequest(path, options = {}) {
      const key = adminKey.value.trim();
      if (!key) throw new Error('请输入管理员密钥。');

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
        throw new Error('请求失败（HTTP ' + response.status + '）。');
      }
      return data;
    }

    document.querySelector('#loadServers').addEventListener('click', async () => {
      try {
        setMessage('正在加载服务器……');
        const servers = await adminRequest('/admin/game-servers');
        renderServers(servers);
        serverCode.innerHTML = '';
        for (const server of servers) {
          const option = document.createElement('option');
          option.value = server.serverCode;
          option.textContent = server.serverName + ' / ' + server.serverCode;
          serverCode.appendChild(option);
        }
        setMessage(servers.length ? '服务器已加载。' : '没有找到服务器。');
      } catch (error) {
        setMessage(errorMessage(error), true);
      }
    });

    function renderServers(items) {
      servers.innerHTML = items.map((server) => [
        '<div style="border-top:1px solid rgba(255,255,255,.1);padding:12px 0;display:grid;gap:8px">',
        '<strong>' + escapeHtml(server.serverName) + ' / ' + escapeHtml(server.serverCode) + '</strong>',
        '<span class="message">状态：' + escapeHtml(statusLabel(server.status)) + '　地址：' + escapeHtml(server.endpointHost || '-') + ':' + escapeHtml(String(server.endpointPort || '-')) + '　在线人数：' + escapeHtml(String(server.latestHeartbeat?.onlineCount ?? '-')) + '</span>',
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
        setMessage('服务器状态已更新。');
        document.querySelector('#loadServers').click();
      } catch (error) {
        setMessage(errorMessage(error), true);
      }
    });

    document.querySelector('#createInstallToken').addEventListener('click', async () => {
      try {
        setMessage('正在生成安装令牌……');
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
        setMessage('安装令牌已生成，仅显示这一次，请立即妥善保存。');
      } catch (error) {
        setMessage(errorMessage(error), true);
      }
    });

    copyInstallToken.addEventListener('click', async () => {
      await navigator.clipboard.writeText(installTokenResult.value);
      setMessage('已复制。');
    });

    document.querySelector('#createClient').addEventListener('click', async () => {
      try {
        setMessage('正在生成插件客户端凭证……');
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
        setMessage('凭证已生成，客户端密钥仅显示这一次，请立即妥善保存。');
      } catch (error) {
        setMessage(errorMessage(error), true);
      }
    });

    copyConfig.addEventListener('click', async () => {
      await navigator.clipboard.writeText(result.value);
      setMessage('已复制。');
    });

    function renderDeployStatus(data) {
      deployStatus.value = [
        '是否启用：' + (data.enabled ? '是' : '否'),
        '是否运行：' + (data.running ? '是' : '否'),
        '执行结果：' + (data.running ? '运行中' : data.exitCode === 0 ? '成功' : data.exitCode == null ? '尚未执行' : '失败'),
        data.message ? '说明：' + deployMessage(data.message) : '',
        data.startedAt ? '开始时间：' + data.startedAt : '',
        data.finishedAt ? '完成时间：' + data.finishedAt : '',
        data.exitCode != null ? '退出码：' + data.exitCode : '',
        data.lastError ? '最近错误：部署更新失败，请查看服务器日志。' : '',
        data.logs ? '日志：\n' + data.logs : '',
      ].filter(Boolean).join('\n');
    }

    async function loadDeployStatus() {
      try {
        setMessage('正在读取部署状态……');
        const data = await adminRequest('/admin/deploy/status');
        renderDeployStatus(data);
        setMessage('部署状态已更新。');
        return data;
      } catch (error) {
        setMessage(errorMessage(error), true);
        return null;
      }
    }

    function pollDeployStatus() {
      window.clearTimeout(deployPollTimer);
      deployPollTimer = window.setTimeout(async () => {
        const data = await loadDeployStatus();
        if (!data || data.running) {
          pollDeployStatus();
        }
      }, 5000);
    }

    document.querySelector('#loadDeployStatus').addEventListener('click', loadDeployStatus);

    document.querySelector('#triggerDeployUpdate').addEventListener('click', async () => {
      if (!window.confirm('确认从远端拉取代码并重启 GameMulti？')) return;
      try {
        setMessage('部署更新已开始……');
        renderDeployStatus(await adminRequest('/admin/deploy/update', { method: 'POST' }));
        pollDeployStatus();
      } catch (error) {
        setMessage(errorMessage(error), true);
      }
    });
  </script>
</body>
</html>`;
  }
}
