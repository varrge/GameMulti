const state = {
  users: [
    {
      userId: 'user_1',
      username: 'player_one',
      email: 'player1@example.com',
      status: 'active',
      inviteCode: 'ABCD1234',
      invitedByUserId: null,
      bindingCount: 1,
      lastLoginAt: '2026-03-28T05:20:00Z',
      createdAt: '2026-03-20T08:00:00Z',
      bindings: [
        {
          bindingId: 'bind_1',
          gameCode: 'minecraft',
          serverCode: 'cn-mc-01',
          platform: 'java',
          gameUserId: 'Steve',
          displayName: 'Steve',
          bindStatus: 'active',
          verifiedAt: '2026-03-28T05:10:00Z',
        },
      ],
    },
    {
      userId: 'user_2',
      username: 'player_two',
      email: 'player2@example.com',
      status: 'disabled',
      inviteCode: 'ZXCV7788',
      invitedByUserId: 'user_1',
      bindingCount: 2,
      lastLoginAt: '2026-03-27T18:40:00Z',
      createdAt: '2026-03-25T11:30:00Z',
      bindings: [
        {
          bindingId: 'bind_2',
          gameCode: 'minecraft',
          serverCode: 'cn-mc-02',
          platform: 'bedrock',
          gameUserId: 'Alex',
          displayName: 'Alex',
          bindStatus: 'inactive',
          verifiedAt: '2026-03-26T10:10:00Z',
        },
        {
          bindingId: 'bind_3',
          gameCode: 'palworld',
          serverCode: 'cn-pw-01',
          platform: 'steam',
          gameUserId: 'PalTamer',
          displayName: 'PalTamer',
          bindStatus: 'active',
          verifiedAt: '2026-03-27T10:00:00Z',
        },
      ],
    },
    {
      userId: 'user_3',
      username: 'banned_player',
      email: 'ban@example.com',
      status: 'banned',
      inviteCode: 'BAN00001',
      invitedByUserId: 'user_2',
      bindingCount: 1,
      lastLoginAt: null,
      createdAt: '2026-03-10T03:15:00Z',
      bindings: [
        {
          bindingId: 'bind_4',
          gameCode: 'minecraft',
          serverCode: 'cn-mc-01',
          platform: 'java',
          gameUserId: 'Griefer',
          displayName: 'Griefer',
          bindStatus: 'banned',
          verifiedAt: '2026-03-12T08:00:00Z',
        },
      ],
    },
  ],
  invites: [
    {
      id: 'invite_1',
      code: 'ABCD1234',
      status: 'active',
      maxUses: 5,
      usedCount: 1,
      ownerUserId: null,
      ownerUsername: null,
      remark: 'seed code',
      createdAt: '2026-03-20T08:00:00Z',
    },
    {
      id: 'invite_2',
      code: 'ZXCV7788',
      status: 'active',
      maxUses: 10,
      usedCount: 3,
      ownerUserId: 'user_1',
      ownerUsername: 'player_one',
      remark: '老玩家返场',
      createdAt: '2026-03-22T09:00:00Z',
    },
    {
      id: 'invite_3',
      code: 'BAN00001',
      status: 'disabled',
      maxUses: 2,
      usedCount: 2,
      ownerUserId: 'user_2',
      ownerUsername: 'player_two',
      remark: '异常批次',
      createdAt: '2026-03-23T06:00:00Z',
    },
  ],
};

function setupNavigation() {
  const buttons = document.querySelectorAll('.nav-link');
  const views = document.querySelectorAll('.view');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.view;
      buttons.forEach((item) => item.classList.toggle('active', item === button));
      views.forEach((view) => view.classList.toggle('active', view.id === `view-${target}`));
    });
  });
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('zh-CN', { hour12: false, timeZone: 'UTC' }) + ' UTC';
}

function renderPlayers(items = state.users) {
  const tbody = document.getElementById('players-table-body');
  tbody.innerHTML = '';

  items.forEach((user) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <strong>${user.username}</strong><br />
        <span class="muted">${user.email}</span>
      </td>
      <td>${user.status}</td>
      <td>${user.inviteCode || '—'}</td>
      <td>${user.bindingCount}</td>
      <td>${formatDate(user.lastLoginAt)}</td>
      <td><button class="inline-button" data-user-id="${user.userId}">查看详情</button></td>
    `;
    tbody.appendChild(row);
  });

  tbody.querySelectorAll('[data-user-id]').forEach((button) => {
    button.addEventListener('click', () => renderPlayerDetail(button.dataset.userId));
  });
}

function renderPlayerDetail(userId) {
  const user = state.users.find((item) => item.userId === userId);
  const container = document.getElementById('player-detail-content');
  if (!user) {
    container.innerHTML = '<p class="danger">未找到玩家详情。</p>';
    return;
  }

  const bindings = user.bindings
    .map(
      (binding) => `
        <li>
          ${binding.gameCode} / ${binding.serverCode} / ${binding.platform} / ${binding.gameUserId}
          <span class="muted">（${binding.bindStatus}，验证于 ${formatDate(binding.verifiedAt)}）</span>
        </li>`,
    )
    .join('');

  container.innerHTML = `
    <div class="kv">
      <strong>用户 ID</strong><span>${user.userId}</span>
      <strong>用户名</strong><span>${user.username}</span>
      <strong>状态</strong><span>${user.status}</span>
      <strong>邀请码</strong><span>${user.inviteCode || '—'}</span>
      <strong>邀请人</strong><span>${user.invitedByUserId || '—'}</span>
      <strong>注册时间</strong><span>${formatDate(user.createdAt)}</span>
    </div>
    <h4>游戏绑定</h4>
    <ul>${bindings || '<li>暂无绑定</li>'}</ul>
    <h4>最近奖励结算</h4>
    <p class="muted">当前演示页预留展示区域，后续可接 reward_settlement 模块。</p>
  `;
}

function setupPlayerFilter() {
  const form = document.getElementById('player-filter-form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const keyword = String(formData.get('keyword') || '').trim().toLowerCase();
    const status = String(formData.get('status') || '').trim();
    const gameCode = String(formData.get('gameCode') || '').trim();

    const result = state.users.filter((user) => {
      if (status && user.status !== status) return false;
      if (gameCode && !user.bindings.some((binding) => binding.gameCode === gameCode)) return false;
      if (!keyword) return true;
      return [user.username, user.email, user.inviteCode, ...user.bindings.map((item) => item.gameUserId)]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(keyword));
    });

    renderPlayers(result);
  });
}

function inviteCard(invite) {
  const remainingUses = Math.max(invite.maxUses - invite.usedCount, 0);
  return `
    <article class="invite-item">
      <div class="panel-header">
        <strong>${invite.code}</strong>
        <span class="badge">${invite.status}</span>
      </div>
      <div class="kv">
        <strong>使用情况</strong><span>${invite.usedCount} / ${invite.maxUses}</span>
        <strong>剩余次数</strong><span>${remainingUses}</span>
        <strong>归属人</strong><span>${invite.ownerUsername || invite.ownerUserId || '—'}</span>
        <strong>备注</strong><span>${invite.remark || '—'}</span>
        <strong>创建时间</strong><span>${formatDate(invite.createdAt)}</span>
      </div>
    </article>
  `;
}

function renderInvites() {
  const filter = document.getElementById('invite-status-filter');
  const list = document.getElementById('invite-list');
  const status = String(filter.value || '').trim();
  const items = state.invites.filter((invite) => !status || invite.status === status);
  list.innerHTML = items.map(inviteCard).join('') || '<p class="muted">没有匹配的邀请码。</p>';
}

function randomCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

function setupInviteActions() {
  document.getElementById('invite-status-filter').addEventListener('change', renderInvites);

  const form = document.getElementById('invite-generate-form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const count = Number(formData.get('count'));
    const maxUses = Number(formData.get('maxUses'));
    const ownerUserId = String(formData.get('ownerUserId') || '').trim() || null;
    const ownerUsername = state.users.find((user) => user.userId === ownerUserId)?.username || null;
    const remark = String(formData.get('remark') || '').trim() || null;

    const nextItems = Array.from({ length: count }).map((_, index) => ({
      id: `invite_${state.invites.length + index + 1}`,
      code: randomCode(),
      status: 'active',
      maxUses,
      usedCount: 0,
      ownerUserId,
      ownerUsername,
      remark,
      createdAt: new Date().toISOString(),
    }));

    state.invites.unshift(...nextItems);
    renderInvites();
    form.reset();
    form.count.value = count;
    form.maxUses.value = maxUses;
  });
}

function setupBanForm() {
  const form = document.getElementById('ban-form');
  const result = document.getElementById('ban-result');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const userId = String(formData.get('userId') || '').trim();
    const reason = String(formData.get('reason') || '').trim();
    const user = state.users.find((item) => item.userId === userId);

    if (!user) {
      result.className = 'result-box danger';
      result.textContent = `未找到用户 ${userId}，可在真实后端里返回 404。`;
      return;
    }

    user.status = 'banned';
    renderPlayers();
    result.className = 'result-box success';
    result.textContent = `已模拟封禁 ${user.username}（${userId}），原因：${reason || '未填写'}。真实实现可接 ban audit / operator log。`;
  });
}

setupNavigation();
setupPlayerFilter();
setupInviteActions();
setupBanForm();
renderPlayers();
renderInvites();
renderPlayerDetail('user_1');
