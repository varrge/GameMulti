const { ForumSsoService } = require('./forum_sso_service');
const { DiscourseForumAdapter } = require('../adapters/discourse_forum_adapter');

/**
 * Admin forum integration demo service.
 *
 * 目的：
 * 1. 给后台 Admin 页面提供 forum account / SSO ticket / sync job 三类查询形态
 * 2. 演示最小人工操作：对失败或已完成的资料同步任务发起重试
 * 3. 复用 ForumSsoService，避免后台与主链路维护两套状态模型
 */
class AdminForumIntegrationService {
  constructor({ forumService } = {}) {
    this.forumService = forumService || new ForumSsoService({
      adapter: new DiscourseForumAdapter({
        baseUrl: 'https://forum.example.com',
        consumePath: '/session/sso_login',
      }),
    });
  }

  seedDemoData() {
    this.forumService.seed();

    this.forumService.users.push({
      id: 'user_2',
      username: 'bob',
      email: 'bob@example.com',
      status: 'banned',
      createdAt: '2026-03-27T12:00:00.000Z',
      updatedAt: '2026-03-27T12:00:00.000Z',
    });

    const entryAlice = this.forumService.issueForumEntry({
      userId: 'user_1',
      forumProvider: 'discourse',
      redirectUrl: '/latest',
      requestIp: '127.0.0.1',
      requestUserAgent: 'admin-demo',
    });
    this.forumService.consumeTicket(entryAlice.ticket);
    this.forumService.processPendingSyncJobs();

    const accountBob = this.forumService.ensureForumAccountForUser('user_2', 'discourse');
    const bobProfileJob = this.forumService.forumSyncJobs.find(
      (job) => job.userId === 'user_2' && job.jobType === 'sync_profile',
    );
    bobProfileJob.status = 'failed';
    bobProfileJob.attemptCount = 2;
    bobProfileJob.lastErrorCode = 'FORUM_API_TIMEOUT';
    bobProfileJob.lastErrorMessage = 'Timeout while syncing profile to forum';
    bobProfileJob.nextRetryAt = '2026-03-28T10:00:00.000Z';
    bobProfileJob.updatedAt = '2026-03-28T09:00:00.000Z';
    accountBob.syncStatus = 'sync_failed';
    accountBob.updatedAt = '2026-03-28T09:00:00.000Z';

    this.forumService.enqueueSyncJob({
      userId: 'user_2',
      forumAccountId: accountBob.id,
      forumProvider: 'discourse',
      jobType: 'sync_ban_state',
      triggerSource: 'user_status_changed',
      payload: { status: 'banned' },
      dedupeKey: 'sync_ban_state:discourse:user_2',
    });

    const entryBob = this.forumService.issueForumEntry({
      userId: 'user_2',
      forumProvider: 'discourse',
      redirectUrl: '/u/bob/preferences',
      requestIp: '127.0.0.2',
      requestUserAgent: 'admin-demo-bob',
    });

    return {
      aliceTicket: entryAlice.ticket,
      bobTicket: entryBob.ticket,
    };
  }

  listForumAccounts({ keyword, forumProvider = 'discourse', syncStatus, userStatus, page = 1, pageSize = 20 } = {}) {
    const normalizedKeyword = keyword ? keyword.toLowerCase() : null;
    const items = this.forumService.forumAccounts
      .filter((account) => {
        if (forumProvider && account.forumProvider !== forumProvider) {
          return false;
        }
        const user = this.requireUser(account.userId);
        if (syncStatus && account.syncStatus !== syncStatus) {
          return false;
        }
        if (userStatus && user.status !== userStatus) {
          return false;
        }
        if (!normalizedKeyword) {
          return true;
        }
        return [
          user.username,
          user.email,
          account.forumUsername,
          account.forumEmail,
          account.externalUid,
        ].filter(Boolean).some((value) => value.toLowerCase().includes(normalizedKeyword));
      })
      .map((account) => this.toForumAccountSummary(account));

    return paginate(items, page, pageSize);
  }

  getForumAccountDetail(forumAccountId) {
    const account = this.forumService.forumAccounts.find((item) => item.id === forumAccountId);
    if (!account) {
      throw this.businessError('FORUM_ACCOUNT_NOT_FOUND', 'Forum account not found');
    }

    const recentTickets = this.forumService.forumSsoTickets
      .filter((item) => item.forumAccountId === forumAccountId)
      .sort(sortByCreatedDesc)
      .slice(0, 10)
      .map((item) => this.toForumTicketSummary(item));

    const recentSyncJobs = this.forumService.forumSyncJobs
      .filter((item) => item.forumAccountId === forumAccountId)
      .sort(sortByCreatedDesc)
      .slice(0, 10)
      .map((item) => this.toForumSyncJobSummary(item));

    return {
      account: this.toForumAccountSummary(account),
      recentTickets,
      recentSyncJobs,
    };
  }

  listTickets({ forumProvider = 'discourse', status, userId, forumAccountId, page = 1, pageSize = 20 } = {}) {
    const items = this.forumService.forumSsoTickets
      .filter((ticket) => {
        if (forumProvider && ticket.forumProvider !== forumProvider) {
          return false;
        }
        if (status && ticket.status !== status) {
          return false;
        }
        if (userId && ticket.userId !== userId) {
          return false;
        }
        if (forumAccountId && ticket.forumAccountId !== forumAccountId) {
          return false;
        }
        return true;
      })
      .sort(sortByCreatedDesc)
      .map((ticket) => this.toForumTicketSummary(ticket));

    return paginate(items, page, pageSize);
  }

  listSyncJobs({ forumProvider = 'discourse', status, jobType, userId, forumAccountId, page = 1, pageSize = 20 } = {}) {
    const items = this.forumService.forumSyncJobs
      .filter((job) => {
        if (forumProvider && job.forumProvider !== forumProvider) {
          return false;
        }
        if (status && job.status !== status) {
          return false;
        }
        if (jobType && job.jobType !== jobType) {
          return false;
        }
        if (userId && job.userId !== userId) {
          return false;
        }
        if (forumAccountId && job.forumAccountId !== forumAccountId) {
          return false;
        }
        return true;
      })
      .sort(sortByCreatedDesc)
      .map((job) => this.toForumSyncJobSummary(job));

    return paginate(items, page, pageSize);
  }

  retryProfileSync({ jobId, operatorId = 'admin_system', reason = null, triggerSource = 'admin_console' } = {}) {
    const job = this.forumService.forumSyncJobs.find((item) => item.id === jobId);
    if (!job) {
      throw this.businessError('FORUM_SYNC_JOB_NOT_FOUND', 'Forum sync job not found');
    }
    if (job.jobType !== 'sync_profile') {
      throw this.businessError('FORUM_SYNC_JOB_TYPE_INVALID', 'Only sync_profile jobs can be retried here');
    }
    if (!['failed', 'succeeded', 'cancelled'].includes(job.status)) {
      throw this.businessError('FORUM_SYNC_JOB_STATUS_CONFLICT', 'Current job status does not allow retry');
    }

    const retried = this.forumService.enqueueSyncJob({
      userId: job.userId,
      forumAccountId: job.forumAccountId,
      forumProvider: job.forumProvider,
      jobType: 'sync_profile',
      triggerSource,
      payload: {
        ...(job.payload || {}),
        retryOfJobId: job.id,
        operatorId,
        reason,
      },
      dedupeKey: `sync_profile_retry:${job.id}:${operatorId}`,
    });

    const account = this.forumService.forumAccounts.find((item) => item.id === job.forumAccountId);
    if (account) {
      account.syncStatus = 'syncing';
      account.updatedAt = new Date().toISOString();
    }

    return {
      accepted: true,
      retriedJob: this.toForumSyncJobSummary(retried),
    };
  }

  toForumAccountSummary(account) {
    const user = this.requireUser(account.userId);
    return {
      forumAccountId: account.id,
      userId: account.userId,
      username: user.username,
      email: user.email,
      userStatus: user.status,
      forumProvider: account.forumProvider,
      forumUserId: account.forumUserId,
      forumUsername: account.forumUsername,
      forumEmail: account.forumEmail,
      externalUid: account.externalUid,
      syncStatus: account.syncStatus,
      mappingSource: account.mappingSource,
      lastSyncedAt: account.lastSyncedAt,
      lastLoginAt: account.lastLoginAt,
      createdAt: account.createdAt,
    };
  }

  toForumTicketSummary(ticket) {
    return {
      ticketId: ticket.id,
      userId: ticket.userId,
      forumAccountId: ticket.forumAccountId,
      forumProvider: ticket.forumProvider,
      ticketPreview: `${ticket.ticket.slice(0, 8)}***`,
      redirectUrl: ticket.redirectUrl,
      status: ticket.status,
      expiresAt: ticket.expiresAt,
      consumedAt: ticket.consumedAt,
      createdAt: ticket.createdAt,
    };
  }

  toForumSyncJobSummary(job) {
    return {
      jobId: job.id,
      userId: job.userId,
      forumAccountId: job.forumAccountId,
      forumProvider: job.forumProvider,
      jobType: job.jobType,
      triggerSource: job.triggerSource,
      status: job.status,
      dedupeKey: job.dedupeKey,
      attemptCount: job.attemptCount,
      maxAttempts: job.maxAttempts,
      nextRetryAt: job.nextRetryAt,
      lastErrorCode: job.lastErrorCode,
      lastErrorMessage: job.lastErrorMessage,
      finishedAt: job.finishedAt,
      createdAt: job.createdAt,
    };
  }

  requireUser(userId) {
    const user = this.forumService.users.find((item) => item.id === userId);
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
}

function paginate(items, page, pageSize) {
  const safePage = Math.max(Number(page) || 1, 1);
  const safePageSize = Math.max(Math.min(Number(pageSize) || 20, 100), 1);
  const start = (safePage - 1) * safePageSize;
  return {
    items: items.slice(start, start + safePageSize),
    page: safePage,
    pageSize: safePageSize,
    total: items.length,
  };
}

function sortByCreatedDesc(a, b) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

module.exports = {
  AdminForumIntegrationService,
};

if (require.main === module) {
  const service = new AdminForumIntegrationService();
  service.seedDemoData();

  const failedJob = service.listSyncJobs({ status: 'failed' }).items[0];
  const detail = service.getForumAccountDetail(service.listForumAccounts({ keyword: 'bob' }).items[0].forumAccountId);

  console.log('Forum accounts:', JSON.stringify(service.listForumAccounts({}), null, 2));
  console.log('Forum account detail:', JSON.stringify(detail, null, 2));
  console.log('Forum tickets:', JSON.stringify(service.listTickets({}), null, 2));
  console.log('Forum sync jobs:', JSON.stringify(service.listSyncJobs({}), null, 2));
  console.log('Retry profile sync:', JSON.stringify(service.retryProfileSync({
    jobId: failedJob.jobId,
    operatorId: 'admin_1',
    reason: 'Manual retry from admin console',
  }), null, 2));
}
