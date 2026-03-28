const crypto = require('node:crypto');

/**
 * 论坛 SSO / 账户映射最小内存版服务骨架。
 *
 * 目的：
 * 1. 验证 forum_accounts / forum_sync_jobs / forum_sso_tickets 三块状态流转
 * 2. 给后续迁移到真实 repository + queue worker 提供服务边界参考
 * 3. 把外部论坛 API 差异收敛到 adapter 层
 */
class ForumSsoService {
  constructor({ adapter, now = () => new Date() } = {}) {
    this.now = now;
    this.adapter = adapter || new InMemoryForumAdapter();
    this.users = [];
    this.forumAccounts = [];
    this.forumSsoTickets = [];
    this.forumSyncJobs = [];
  }

  seed() {
    this.users.push({
      id: 'user_1',
      username: 'alice',
      email: 'alice@example.com',
      status: 'active',
      createdAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    });
  }

  ensureForumAccountForUser(userId, forumProvider = 'discourse') {
    const user = this.requireUser(userId);
    let account = this.forumAccounts.find((item) => item.userId === userId && item.forumProvider === forumProvider);

    if (account) {
      return account;
    }

    const externalUid = user.id;
    const existingForumUser = this.adapter.findUserByExternalUid(externalUid) || this.adapter.findUserByEmail(user.email);

    if (existingForumUser) {
      account = this.createForumAccount({
        user,
        forumProvider,
        forumUserId: existingForumUser.id,
        forumUsername: existingForumUser.username,
        forumEmail: existingForumUser.email,
        externalUid,
        mappingSource: 'matched_existing',
      });
    } else {
      const created = this.adapter.createUser({
        externalUid,
        email: user.email,
        username: user.username,
        displayName: user.username,
      });
      account = this.createForumAccount({
        user,
        forumProvider,
        forumUserId: created.id,
        forumUsername: created.username,
        forumEmail: created.email,
        externalUid,
        mappingSource: 'auto_create',
      });
    }

    this.enqueueSyncJob({
      userId: user.id,
      forumAccountId: account.id,
      forumProvider,
      jobType: 'sync_profile',
      triggerSource: 'user_login',
      payload: {
        username: user.username,
        email: user.email,
        status: user.status,
      },
      dedupeKey: `sync_profile:${forumProvider}:${user.id}`,
    });

    return account;
  }

  issueForumEntry({ userId, forumProvider = 'discourse', redirectUrl, requestIp, requestUserAgent }) {
    const account = this.ensureForumAccountForUser(userId, forumProvider);
    if (account.syncStatus === 'disabled') {
      throw this.businessError('FORUM_ACCOUNT_DISABLED', 'Forum account disabled');
    }

    const expiresAt = new Date(this.now().getTime() + 5 * 60 * 1000);
    const ticket = {
      id: this.id('forum_ticket'),
      userId,
      forumAccountId: account.id,
      forumProvider,
      ticket: this.randomToken(24),
      redirectUrl: redirectUrl || null,
      status: 'issued',
      expiresAt: expiresAt.toISOString(),
      consumedAt: null,
      requestIp: requestIp || null,
      requestUserAgent: requestUserAgent || null,
      createdAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    };

    this.forumSsoTickets.push(ticket);

    return {
      ticket: ticket.ticket,
      forumAccountId: account.id,
      forumUserId: account.forumUserId,
      consumeUrl: this.adapter.buildConsumeUrl(ticket.ticket, redirectUrl),
      expiresIn: 300,
    };
  }

  consumeTicket(ticketValue) {
    const ticket = this.forumSsoTickets.find((item) => item.ticket === ticketValue);
    if (!ticket) {
      throw this.businessError('FORUM_TICKET_NOT_FOUND', 'Forum SSO ticket not found');
    }
    if (ticket.status !== 'issued') {
      throw this.businessError('FORUM_TICKET_ALREADY_USED', 'Forum SSO ticket already used');
    }
    if (this.now() > new Date(ticket.expiresAt)) {
      ticket.status = 'expired';
      ticket.updatedAt = this.now().toISOString();
      throw this.businessError('FORUM_TICKET_EXPIRED', 'Forum SSO ticket expired');
    }

    ticket.status = 'consumed';
    ticket.consumedAt = this.now().toISOString();
    ticket.updatedAt = this.now().toISOString();

    const forumAccount = this.forumAccounts.find((item) => item.id === ticket.forumAccountId);
    forumAccount.lastLoginAt = this.now().toISOString();
    forumAccount.updatedAt = this.now().toISOString();

    return {
      userId: ticket.userId,
      forumUserId: forumAccount.forumUserId,
      forumUsername: forumAccount.forumUsername,
      redirectUrl: ticket.redirectUrl,
    };
  }

  enqueueSyncJob({ userId, forumAccountId, forumProvider, jobType, triggerSource, payload, dedupeKey }) {
    const existingPending = this.forumSyncJobs.find(
      (item) => item.dedupeKey === dedupeKey && ['pending', 'processing'].includes(item.status),
    );
    if (existingPending) {
      return existingPending;
    }

    const job = {
      id: this.id('forum_sync_job'),
      userId,
      forumAccountId: forumAccountId || null,
      forumProvider,
      jobType,
      triggerSource,
      payload,
      status: 'pending',
      dedupeKey,
      attemptCount: 0,
      maxAttempts: 5,
      nextRetryAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      finishedAt: null,
      createdAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    };

    this.forumSyncJobs.push(job);
    return job;
  }

  processPendingSyncJobs(limit = 20) {
    const now = this.now();
    const candidates = this.forumSyncJobs
      .filter((item) => item.status === 'pending' && (!item.nextRetryAt || now >= new Date(item.nextRetryAt)))
      .slice(0, limit);

    const results = [];
    for (const job of candidates) {
      job.status = 'processing';
      job.attemptCount += 1;
      job.updatedAt = this.now().toISOString();

      try {
        const user = this.requireUser(job.userId);
        const forumAccount = job.forumAccountId
          ? this.forumAccounts.find((item) => item.id === job.forumAccountId)
          : this.forumAccounts.find((item) => item.userId === job.userId && item.forumProvider === job.forumProvider);

        if (!forumAccount) {
          throw this.businessError('FORUM_ACCOUNT_NOT_FOUND', 'Forum account not found for sync job');
        }

        if (job.jobType === 'sync_profile') {
          this.adapter.syncProfile({
            forumUserId: forumAccount.forumUserId,
            username: user.username,
            email: user.email,
            status: user.status,
          });
        } else if (job.jobType === 'sync_ban_state') {
          this.adapter.syncBanState({
            forumUserId: forumAccount.forumUserId,
            status: user.status,
          });
        } else {
          throw this.businessError('UNSUPPORTED_JOB_TYPE', `Unsupported job type: ${job.jobType}`);
        }

        forumAccount.syncStatus = 'active';
        forumAccount.lastSyncedAt = this.now().toISOString();
        forumAccount.updatedAt = this.now().toISOString();

        job.status = 'succeeded';
        job.finishedAt = this.now().toISOString();
        job.lastErrorCode = null;
        job.lastErrorMessage = null;
      } catch (error) {
        const retriable = !error.code || !['UNSUPPORTED_JOB_TYPE', 'FORUM_ACCOUNT_NOT_FOUND'].includes(error.code);
        job.status = retriable && job.attemptCount < job.maxAttempts ? 'pending' : 'failed';
        job.nextRetryAt = job.status === 'pending'
          ? new Date(this.now().getTime() + job.attemptCount * 60 * 1000).toISOString()
          : null;
        job.lastErrorCode = error.code || 'UNKNOWN_ERROR';
        job.lastErrorMessage = error.message;

        const forumAccount = job.forumAccountId
          ? this.forumAccounts.find((item) => item.id === job.forumAccountId)
          : null;
        if (forumAccount) {
          forumAccount.syncStatus = 'sync_failed';
          forumAccount.updatedAt = this.now().toISOString();
        }
      }

      job.updatedAt = this.now().toISOString();
      results.push(job);
    }

    return results;
  }

  createForumAccount({ user, forumProvider, forumUserId, forumUsername, forumEmail, externalUid, mappingSource }) {
    const account = {
      id: this.id('forum_account'),
      userId: user.id,
      forumProvider,
      forumUserId,
      forumUsername,
      forumEmail,
      externalUid,
      syncStatus: 'pending_initial_sync',
      mappingSource,
      lastSyncedAt: null,
      lastLoginAt: null,
      meta: null,
      createdAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    };
    this.forumAccounts.push(account);
    return account;
  }

  requireUser(userId) {
    const user = this.users.find((item) => item.id === userId);
    if (!user) {
      throw this.businessError('USER_NOT_FOUND', 'User not found');
    }
    return user;
  }

  businessError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  id(prefix) {
    return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
  }

  randomToken(bytes = 24) {
    return crypto.randomBytes(bytes).toString('hex');
  }
}

class InMemoryForumAdapter {
  constructor() {
    this.users = [];
  }

  createUser({ externalUid, email, username, displayName }) {
    const user = {
      id: `forum_user_${this.users.length + 1}`,
      externalUid,
      email,
      username,
      displayName,
      banned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.users.push(user);
    return user;
  }

  findUserByExternalUid(externalUid) {
    return this.users.find((item) => item.externalUid === externalUid) || null;
  }

  findUserByEmail(email) {
    return this.users.find((item) => item.email === email) || null;
  }

  syncProfile({ forumUserId, username, email, status }) {
    const user = this.users.find((item) => item.id === forumUserId);
    if (!user) {
      const error = new Error('Forum user not found');
      error.code = 'FORUM_USER_NOT_FOUND';
      throw error;
    }
    user.username = username;
    user.email = email;
    user.status = status;
    user.updatedAt = new Date().toISOString();
    return user;
  }

  syncBanState({ forumUserId, status }) {
    const user = this.users.find((item) => item.id === forumUserId);
    if (!user) {
      const error = new Error('Forum user not found');
      error.code = 'FORUM_USER_NOT_FOUND';
      throw error;
    }
    user.banned = ['banned', 'disabled'].includes(status);
    user.updatedAt = new Date().toISOString();
    return user;
  }

  buildConsumeUrl(ticket, redirectUrl) {
    const search = new URLSearchParams({ ticket });
    if (redirectUrl) {
      search.set('redirect', redirectUrl);
    }
    return `https://forum.example.com/sso/consume?${search.toString()}`;
  }
}

module.exports = {
  ForumSsoService,
  InMemoryForumAdapter,
};

if (require.main === module) {
  const service = new ForumSsoService();
  service.seed();

  const entry = service.issueForumEntry({
    userId: 'user_1',
    redirectUrl: '/latest',
    requestIp: '127.0.0.1',
    requestUserAgent: 'demo-script',
  });

  console.log('Issue forum entry:', entry);
  console.log('Consume ticket:', service.consumeTicket(entry.ticket));
  console.log('Process jobs:', service.processPendingSyncJobs());
}

