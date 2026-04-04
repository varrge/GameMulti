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
  forumAccounts: [
    {
      forumAccountId: 'forum_acc_1',
      userId: 'user_1',
      username: 'player_one',
      email: 'player1@example.com',
      userStatus: 'active',
      forumProvider: 'discourse',
      forumUserId: 'd_1001',
      forumUsername: 'player-one',
      forumEmail: 'player1@forum.example.com',
      externalUid: 'gm_user_1',
      syncStatus: 'active',
      mappingSource: 'sso_bootstrap',
      lastSyncedAt: '2026-03-28T05:18:00Z',
      lastLoginAt: '2026-03-28T05:20:00Z',
      lastErrorCode: null,
      lastErrorMessage: null,
      recentTicketIds: ['ticket_1', 'ticket_2'],
      recentJobIds: ['job_1', 'job_2'],
    },
    {
      forumAccountId: 'forum_acc_2',
      userId: 'user_2',
      username: 'player_two',
      email: 'player2@example.com',
      userStatus: 'disabled',
      forumProvider: 'discourse',
      forumUserId: 'd_1002',
      forumUsername: 'player-two',
      forumEmail: 'player2@forum.example.com',
      externalUid: 'gm_user_2',
      syncStatus: 'sync_failed',
      mappingSource: 'admin_backfill',
      lastSyncedAt: '2026-03-27T18:00:00Z',
      lastLoginAt: '2026-03-27T18:40:00Z',
      lastErrorCode: 'PROFILE_SYNC_TIMEOUT',
      lastErrorMessage: '论坛资料同步超时，头像与签名未落库。',
      recentTicketIds: ['ticket_3'],
      recentJobIds: ['job_3', 'job_4'],
    },
    {
      forumAccountId: 'forum_acc_3',
      userId: 'user_3',
      username: 'banned_player',
      email: 'ban@example.com',
      userStatus: 'banned',
      forumProvider: 'discourse',
      forumUserId: 'd_1003',
      forumUsername: 'banned-player',
      forumEmail: 'ban@forum.example.com',
      externalUid: 'gm_user_3',
      syncStatus: 'disabled',
      mappingSource: 'sso_bootstrap',
      lastSyncedAt: '2026-03-12T08:05:00Z',
      lastLoginAt: null,
      lastErrorCode: 'ACCOUNT_DISABLED',
      lastErrorMessage: '主站账号已封禁，论坛同步入口已关闭。',
      recentTicketIds: ['ticket_4'],
      recentJobIds: ['job_5'],
    },
  ],
  forumTickets: [
    {
      ticketId: 'ticket_1',
      forumAccountId: 'forum_acc_1',
      userId: 'user_1',
      status: 'consumed',
      ticketPreview: 'gm1x-9af2',
      redirectUrl: 'https://forum.example.com/session/sso_login',
      expiresAt: '2026-03-28T05:25:00Z',
      consumedAt: '2026-03-28T05:20:30Z',
      createdAt: '2026-03-28T05:19:50Z',
    },
    {
      ticketId: 'ticket_2',
      forumAccountId: 'forum_acc_1',
      userId: 'user_1',
      status: 'issued',
      ticketPreview: 'gm1x-4ke8',
      redirectUrl: 'https://forum.example.com/session/sso_login',
      expiresAt: '2026-03-28T10:10:00Z',
      consumedAt: null,
      createdAt: '2026-03-28T09:40:00Z',
    },
    {
      ticketId: 'ticket_3',
      forumAccountId: 'forum_acc_2',
      userId: 'user_2',
      status: 'expired',
      ticketPreview: 'gm2x-13we',
      redirectUrl: 'https://forum.example.com/session/sso_login',
      expiresAt: '2026-03-27T18:20:00Z',
      consumedAt: null,
      createdAt: '2026-03-27T18:05:00Z',
    },
    {
      ticketId: 'ticket_4',
      forumAccountId: 'forum_acc_3',
      userId: 'user_3',
      status: 'cancelled',
      ticketPreview: 'gm3x-77bb',
      redirectUrl: 'https://forum.example.com/session/sso_login',
      expiresAt: '2026-03-12T08:20:00Z',
      consumedAt: null,
      createdAt: '2026-03-12T08:02:00Z',
    },
  ],
  forumJobs: [
    {
      jobId: 'job_1',
      forumAccountId: 'forum_acc_1',
      userId: 'user_1',
      jobType: 'create_account',
      triggerSource: 'sso_login',
      status: 'succeeded',
      attemptCount: 1,
      maxAttempts: 3,
      dedupeKey: 'create_account:user_1',
      nextRetryAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      finishedAt: '2026-03-20T08:01:00Z',
      createdAt: '2026-03-20T08:00:10Z',
      retryOfJobId: null,
    },
    {
      jobId: 'job_2',
      forumAccountId: 'forum_acc_1',
      userId: 'user_1',
      jobType: 'sync_profile',
      triggerSource: 'profile_update',
      status: 'succeeded',
      attemptCount: 1,
      maxAttempts: 3,
      dedupeKey: 'sync_profile:user_1:20260328',
      nextRetryAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      finishedAt: '2026-03-28T05:18:00Z',
      createdAt: '2026-03-28T05:17:10Z',
      retryOfJobId: null,
    },
    {
      jobId: 'job_3',
      forumAccountId: 'forum_acc_2',
      userId: 'user_2',
      jobType: 'sync_profile',
      triggerSource: 'profile_update',
      status: 'failed',
      attemptCount: 3,
      maxAttempts: 3,
      dedupeKey: 'sync_profile:user_2:20260327',
      nextRetryAt: null,
      lastErrorCode: 'PROFILE_SYNC_TIMEOUT',
      lastErrorMessage: '论坛资料同步超时，建议管理员重试。',
      finishedAt: '2026-03-27T18:00:00Z',
      createdAt: '2026-03-27T17:52:00Z',
      retryOfJobId: null,
    },
    {
      jobId: 'job_4',
      forumAccountId: 'forum_acc_2',
      userId: 'user_2',
      jobType: 'sync_ban_state',
      triggerSource: 'user_status_change',
      status: 'pending',
      attemptCount: 0,
      maxAttempts: 5,
      dedupeKey: 'sync_ban_state:user_2',
      nextRetryAt: '2026-03-28T10:00:00Z',
      lastErrorCode: null,
      lastErrorMessage: null,
      finishedAt: null,
      createdAt: '2026-03-28T09:10:00Z',
      retryOfJobId: null,
    },
    {
      jobId: 'job_5',
      forumAccountId: 'forum_acc_3',
      userId: 'user_3',
      jobType: 'sync_ban_state',
      triggerSource: 'moderation_action',
      status: 'succeeded',
      attemptCount: 1,
      maxAttempts: 5,
      dedupeKey: 'sync_ban_state:user_3',
      nextRetryAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      finishedAt: '2026-03-12T08:05:00Z',
      createdAt: '2026-03-12T08:03:00Z',
      retryOfJobId: null,
    },
  ],
  selectedForumAccountId: 'forum_acc_2',
  forumAccountFilter: {
    keyword: '',
    syncStatus: '',
    userStatus: '',
  },
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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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

function getForumAccountById(forumAccountId) {
  return state.forumAccounts.find((item) => item.forumAccountId === forumAccountId) || null;
}

function getForumJobsByAccount(forumAccountId) {
  return state.forumJobs
    .filter((job) => job.forumAccountId === forumAccountId)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}

function getForumTicketsByAccount(forumAccountId) {
  return state.forumTickets
    .filter((ticket) => ticket.forumAccountId === forumAccountId)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}

function getFilteredForumAccounts() {
  const { keyword, syncStatus, userStatus } = state.forumAccountFilter;
  return state.forumAccounts.filter((account) => {
    if (syncStatus && account.syncStatus !== syncStatus) return false;
    if (userStatus && account.userStatus !== userStatus) return false;
    if (!keyword) return true;

    const haystack = [
      account.username,
      account.email,
      account.forumUsername,
      account.forumEmail,
      account.externalUid,
      account.forumUserId,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(keyword);
  });
}

function renderForumAccounts() {
  const items = getFilteredForumAccounts();
  const tbody = document.getElementById('forum-account-table-body');
  const empty = document.getElementById('forum-account-empty');
  const counter = document.getElementById('forum-account-count');

  tbody.innerHTML = '';
  counter.textContent = `共 ${items.length} 条`;

  items.forEach((account) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <strong>${account.username}</strong><br />
        <span class="muted">${account.email}</span>
      </td>
      <td>
        <strong>${account.forumUsername}</strong><br />
        <span class="muted">${account.forumUserId} / ${account.externalUid}</span>
      </td>
      <td><span class="status-pill status-${account.syncStatus}">${account.syncStatus}</span></td>
      <td>${account.lastErrorMessage ? `<span class="danger">${escapeHtml(account.lastErrorMessage)}</span>` : '<span class="muted">—</span>'}</td>
      <td>${formatDate(account.lastSyncedAt)}</td>
      <td><button class="inline-button" data-forum-account-id="${account.forumAccountId}">查看详情</button></td>
    `;
    tbody.appendChild(row);
  });

  empty.classList.toggle('hidden', items.length > 0);

  tbody.querySelectorAll('[data-forum-account-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedForumAccountId = button.dataset.forumAccountId;
      renderForumDetail();
      renderForumTickets();
      renderForumJobs();
    });
  });

  if (!items.some((item) => item.forumAccountId === state.selectedForumAccountId)) {
    state.selectedForumAccountId = items[0]?.forumAccountId || null;
  }
}

function renderForumDetail() {
  const account = getForumAccountById(state.selectedForumAccountId);
  const statusBadge = document.getElementById('forum-detail-status');
  const container = document.getElementById('forum-account-detail-content');
  const retryForm = document.getElementById('forum-retry-form');

  if (!account) {
    statusBadge.textContent = '等待选择';
    container.innerHTML = '<p class="muted">当前没有可展示的论坛账户详情。</p>';
    if (retryForm) retryForm.jobId.value = '';
    return;
  }

  statusBadge.textContent = account.syncStatus;

  const recentTickets = getForumTicketsByAccount(account.forumAccountId).slice(0, 3);
  const recentJobs = getForumJobsByAccount(account.forumAccountId).slice(0, 3);
  const latestRetryableJob = recentJobs.find(
    (job) => job.jobType === 'sync_profile' && ['failed', 'succeeded', 'cancelled'].includes(job.status),
  );

  if (retryForm) {
    retryForm.jobId.value = latestRetryableJob?.jobId || '';
  }

  container.innerHTML = `
    <div class="kv">
      <strong>forumAccountId</strong><span>${account.forumAccountId}</span>
      <strong>主站用户</strong><span>${account.username} (${account.userId})</span>
      <strong>论坛账户</strong><span>${account.forumUsername} (${account.forumUserId})</span>
      <strong>forum email</strong><span>${account.forumEmail}</span>
      <strong>mapping source</strong><span>${account.mappingSource}</span>
      <strong>externalUid</strong><span>${account.externalUid}</span>
      <strong>主站状态</strong><span>${account.userStatus}</span>
      <strong>最近同步</strong><span>${formatDate(account.lastSyncedAt)}</span>
      <strong>最近登录</strong><span>${formatDate(account.lastLoginAt)}</span>
      <strong>最近失败代码</strong><span>${account.lastErrorCode || '—'}</span>
    </div>
    <div class="notice-box ${account.lastErrorMessage ? 'notice-danger' : ''}">
      ${account.lastErrorMessage || '当前没有失败原因，映射状态正常。'}
    </div>
    <div class="mini-columns">
      <div>
        <h4>最近 Ticket</h4>
        <ul>
          ${recentTickets
            .map(
              (ticket) => `<li>${ticket.ticketId} · ${ticket.status} · 过期于 ${formatDate(ticket.expiresAt)}</li>`,
            )
            .join('') || '<li>暂无 ticket</li>'}
        </ul>
      </div>
      <div>
        <h4>最近 Sync Job</h4>
        <ul>
          ${recentJobs
            .map(
              (job) => `<li>${job.jobId} · ${job.jobType} · ${job.status}${job.lastErrorCode ? ` · ${job.lastErrorCode}` : ''}</li>`,
            )
            .join('') || '<li>暂无同步任务</li>'}
        </ul>
      </div>
    </div>
  `;
}

function renderForumTickets() {
  const filter = document.getElementById('forum-ticket-status-filter');
  const list = document.getElementById('forum-ticket-list');
  const selectedAccountId = state.selectedForumAccountId;
  const status = String(filter?.value || '').trim();

  const items = state.forumTickets
    .filter((ticket) => !selectedAccountId || ticket.forumAccountId === selectedAccountId)
    .filter((ticket) => !status || ticket.status === status)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));

  list.innerHTML = items.length
    ? items
        .map(
          (ticket) => `
            <article class="stack-item">
              <div class="panel-header compact-header">
                <strong>${ticket.ticketId}</strong>
                <span class="status-pill status-${ticket.status}">${ticket.status}</span>
              </div>
              <div class="kv compact-kv">
                <strong>ticket preview</strong><span>${ticket.ticketPreview}</span>
                <strong>userId</strong><span>${ticket.userId}</span>
                <strong>redirect</strong><span>${ticket.redirectUrl}</span>
                <strong>expiresAt</strong><span>${formatDate(ticket.expiresAt)}</span>
                <strong>consumedAt</strong><span>${formatDate(ticket.consumedAt)}</span>
              </div>
            </article>
          `,
        )
        .join('')
    : '<p class="muted">没有匹配的 ticket 记录。</p>';
}

function renderForumJobs() {
  const filter = document.getElementById('forum-job-status-filter');
  const list = document.getElementById('forum-job-list');
  const selectedAccountId = state.selectedForumAccountId;
  const status = String(filter?.value || '').trim();

  const items = state.forumJobs
    .filter((job) => !selectedAccountId || job.forumAccountId === selectedAccountId)
    .filter((job) => !status || job.status === status)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));

  list.innerHTML = items.length
    ? items
        .map(
          (job) => `
            <article class="stack-item">
              <div class="panel-header compact-header align-start">
                <div>
                  <strong>${job.jobId}</strong>
                  <p class="muted small-text">${job.jobType} · ${job.triggerSource}</p>
                </div>
                <div class="status-group">
                  <span class="status-pill status-${job.status}">${job.status}</span>
                  ${job.jobType === 'sync_profile' ? `<button class="inline-button retry-button" data-job-id="${job.jobId}">带入重试</button>` : ''}
                </div>
              </div>
              <div class="kv compact-kv">
                <strong>attempt</strong><span>${job.attemptCount} / ${job.maxAttempts}</span>
                <strong>dedupeKey</strong><span>${job.dedupeKey}</span>
                <strong>nextRetryAt</strong><span>${formatDate(job.nextRetryAt)}</span>
                <strong>lastErrorCode</strong><span>${job.lastErrorCode || '—'}</span>
                <strong>lastError</strong><span>${job.lastErrorMessage || '—'}</span>
                <strong>finishedAt</strong><span>${formatDate(job.finishedAt)}</span>
              </div>
            </article>
          `,
        )
        .join('')
    : '<p class="muted">没有匹配的 sync job 记录。</p>';

  list.querySelectorAll('.retry-button').forEach((button) => {
    button.addEventListener('click', () => {
      const retryForm = document.getElementById('forum-retry-form');
      retryForm.jobId.value = button.dataset.jobId;
      document.getElementById('forum-retry-result').className = 'result-box muted';
      document.getElementById('forum-retry-result').textContent = `已带入 ${button.dataset.jobId}，可以直接触发重试。`;
    });
  });
}

function setupForumFilter() {
  const form = document.getElementById('forum-filter-form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    state.forumAccountFilter.keyword = String(formData.get('keyword') || '').trim().toLowerCase();
    state.forumAccountFilter.syncStatus = String(formData.get('syncStatus') || '').trim();
    state.forumAccountFilter.userStatus = String(formData.get('userStatus') || '').trim();
    renderForumAccounts();
    renderForumDetail();
    renderForumTickets();
    renderForumJobs();
  });
}

function setupForumPanels() {
  document.getElementById('forum-ticket-status-filter').addEventListener('change', renderForumTickets);
  document.getElementById('forum-job-status-filter').addEventListener('change', renderForumJobs);

  const retryForm = document.getElementById('forum-retry-form');
  const retryResult = document.getElementById('forum-retry-result');

  retryForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(retryForm);
    const jobId = String(formData.get('jobId') || '').trim();
    const operatorId = String(formData.get('operatorId') || '').trim() || 'admin_demo_operator';
    const reason = String(formData.get('reason') || '').trim() || '管理员手动重试资料同步';
    const sourceJob = state.forumJobs.find((job) => job.jobId === jobId);

    if (!sourceJob) {
      retryResult.className = 'result-box danger';
      retryResult.textContent = `未找到任务 ${jobId}，真实后端应返回 404。`;
      return;
    }

    if (sourceJob.jobType !== 'sync_profile') {
      retryResult.className = 'result-box danger';
      retryResult.textContent = `任务 ${jobId} 不是 sync_profile，当前不允许重试。`;
      return;
    }

    if (!['failed', 'succeeded', 'cancelled'].includes(sourceJob.status)) {
      retryResult.className = 'result-box danger';
      retryResult.textContent = `任务 ${jobId} 当前状态是 ${sourceJob.status}，真实后端应返回 409。`;
      return;
    }

    const now = new Date().toISOString();
    const nextJobId = `job_${state.forumJobs.length + 1}`;
    const newJob = {
      jobId: nextJobId,
      forumAccountId: sourceJob.forumAccountId,
      userId: sourceJob.userId,
      jobType: 'sync_profile',
      triggerSource: 'admin_console',
      status: 'pending',
      attemptCount: 0,
      maxAttempts: sourceJob.maxAttempts,
      dedupeKey: `retry:${sourceJob.jobId}:${Date.now()}`,
      nextRetryAt: now,
      lastErrorCode: null,
      lastErrorMessage: null,
      finishedAt: null,
      createdAt: now,
      retryOfJobId: sourceJob.jobId,
      operatorId,
      reason,
    };

    state.forumJobs.unshift(newJob);

    const account = getForumAccountById(sourceJob.forumAccountId);
    if (account) {
      account.syncStatus = 'syncing';
      account.lastErrorCode = null;
      account.lastErrorMessage = null;
      account.lastSyncedAt = now;
      account.recentJobIds = [newJob.jobId, ...account.recentJobIds.filter((item) => item !== newJob.jobId)];
    }

    retryResult.className = 'result-box success';
    retryResult.textContent = `已模拟受理重试：${sourceJob.jobId} -> ${nextJobId}，operator=${operatorId}，reason=${reason}。真实实现里这里会返回 202 + retriedJob。`;

    renderForumAccounts();
    renderForumDetail();
    renderForumJobs();
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
setupForumFilter();
setupForumPanels();
setupInviteActions();
setupBanForm();
renderPlayers();
renderInvites();
renderForumAccounts();
renderForumDetail();
renderForumTickets();
renderForumJobs();
renderPlayerDetail('user_1');
