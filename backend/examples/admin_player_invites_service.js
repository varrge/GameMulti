const crypto = require('node:crypto');

/**
 * Admin 玩家查询与邀请码管理内存版示例。
 *
 * 目标：
 * 1. 验证后台列表过滤、详情聚合、批量生成邀请码这三块边界
 * 2. 给后续接 ORM / Service / Controller 时一个最小参考
 */
class AdminPlayerInvitesService {
  constructor(now = () => new Date()) {
    this.now = now;
    this.users = [];
    this.games = [];
    this.servers = [];
    this.gameAccounts = [];
    this.userGameBindings = [];
    this.invitationCodes = [];
  }

  seed() {
    this.games.push({ id: 'game_1', code: 'minecraft', name: 'Minecraft' });
    this.servers.push({ id: 'server_1', gameId: 'game_1', serverCode: 'cn-mc-01', serverName: 'CN MC 01' });

    this.invitationCodes.push({
      id: 'invite_1',
      code: 'ABCD1234',
      createdBy: 'admin_1',
      ownerUserId: null,
      maxUses: 5,
      usedCount: 1,
      startsAt: null,
      expiresAt: null,
      status: 'active',
      remark: 'seed code',
      createdAt: this.now().toISOString(),
    });

    this.users.push({
      id: 'user_1',
      username: 'player_one',
      email: 'player1@example.com',
      status: 'active',
      invitationCodeId: 'invite_1',
      invitedByUserId: null,
      lastLoginAt: this.now().toISOString(),
      createdAt: this.now().toISOString(),
    });

    this.gameAccounts.push({
      id: 'ga_1',
      gameId: 'game_1',
      platform: 'java',
      gameUserId: 'Steve',
      normalizedGameUserId: 'steve',
      displayName: 'Steve',
    });

    this.userGameBindings.push({
      id: 'bind_1',
      userId: 'user_1',
      gameAccountId: 'ga_1',
      serverId: 'server_1',
      bindStatus: 'active',
      verifiedAt: this.now().toISOString(),
      createdAt: this.now().toISOString(),
    });
  }

  listPlayers(query = {}) {
    const keyword = String(query.keyword || '').trim().toLowerCase();
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = Math.min(this.toPositiveInt(query.pageSize, 20), 100);

    let items = this.users.filter((user) => {
      if (query.status && user.status !== query.status) return false;

      const bindings = this.userGameBindings.filter((binding) => binding.userId === user.id);
      const accountIds = new Set(bindings.map((binding) => binding.gameAccountId));
      const accounts = this.gameAccounts.filter((account) => accountIds.has(account.id));
      const invite = this.invitationCodes.find((item) => item.id === user.invitationCodeId);

      if (query.gameCode) {
        const gameMatched = accounts.some((account) => {
          const game = this.games.find((item) => item.id === account.gameId);
          return game?.code === query.gameCode;
        });
        if (!gameMatched) return false;
      }

      if (query.serverCode) {
        const serverMatched = bindings.some((binding) => {
          const server = this.servers.find((item) => item.id === binding.serverId);
          return server?.serverCode === query.serverCode;
        });
        if (!serverMatched) return false;
      }

      if (query.inviteCode && invite?.code !== String(query.inviteCode).trim().toUpperCase()) return false;

      if (!keyword) return true;

      return [
        user.username,
        user.email,
        invite?.code,
        ...accounts.map((account) => account.gameUserId),
        ...accounts.map((account) => account.displayName),
      ].filter(Boolean).some((field) => String(field).toLowerCase().includes(keyword));
    });

    items = items
      .map((user) => this.presentPlayerSummary(user))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    return this.paginate(items, page, pageSize);
  }

  getPlayerDetail(userId) {
    const user = this.users.find((item) => item.id === userId);
    if (!user) throw this.businessError('USER_NOT_FOUND', 'User not found');

    const summary = this.presentPlayerSummary(user);
    const invite = this.invitationCodes.find((item) => item.id === user.invitationCodeId);
    const bindings = this.userGameBindings
      .filter((item) => item.userId === user.id)
      .map((binding) => {
        const account = this.gameAccounts.find((item) => item.id === binding.gameAccountId);
        const server = this.servers.find((item) => item.id === binding.serverId);
        const game = this.games.find((item) => item.id === account?.gameId);
        return {
          bindingId: binding.id,
          gameCode: game?.code || null,
          serverCode: server?.serverCode || null,
          platform: account?.platform || null,
          gameUserId: account?.gameUserId || null,
          displayName: account?.displayName || null,
          bindStatus: binding.bindStatus,
          verifiedAt: binding.verifiedAt,
        };
      });

    return {
      userId: user.id,
      profile: summary,
      invite: invite
        ? {
            code: invite.code,
            codeStatus: invite.status,
            usedCount: invite.usedCount,
            maxUses: invite.maxUses,
            expiresAt: invite.expiresAt,
          }
        : null,
      bindings,
      recentRewardSettlements: [],
    };
  }

  listInvitationCodes(query = {}) {
    const keyword = String(query.keyword || '').trim().toLowerCase();
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = Math.min(this.toPositiveInt(query.pageSize, 20), 100);

    const items = this.invitationCodes
      .filter((item) => {
        if (query.status && item.status !== query.status) return false;
        if (query.ownerUserId && item.ownerUserId !== query.ownerUserId) return false;
        if (!keyword) return true;
        return [item.code, item.remark].filter(Boolean).some((field) => String(field).toLowerCase().includes(keyword));
      })
      .map((item) => this.presentInvite(item))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    return this.paginate(items, page, pageSize);
  }

  generateInvitationCodes({ count, maxUses, ownerUserId = null, startsAt = null, expiresAt = null, remark = null, createdBy = 'admin_system' }) {
    if (!Number.isInteger(count) || count <= 0 || count > 500) {
      throw this.businessError('INVALID_COUNT', 'count must be between 1 and 500');
    }
    if (!Number.isInteger(maxUses) || maxUses <= 0 || maxUses > 1000) {
      throw this.businessError('INVALID_MAX_USES', 'maxUses must be between 1 and 1000');
    }

    const items = [];
    for (let i = 0; i < count; i += 1) {
      const code = this.createUniqueInviteCode();
      const invite = {
        id: `invite_${this.invitationCodes.length + 1}`,
        code,
        createdBy,
        ownerUserId,
        maxUses,
        usedCount: 0,
        startsAt,
        expiresAt,
        status: 'active',
        remark,
        createdAt: this.now().toISOString(),
      };
      this.invitationCodes.push(invite);
      items.push(this.presentInvite(invite));
    }

    return { createdCount: items.length, items };
  }

  presentPlayerSummary(user) {
    const invite = this.invitationCodes.find((item) => item.id === user.invitationCodeId);
    const bindingCount = this.userGameBindings.filter((item) => item.userId === user.id).length;
    return {
      userId: user.id,
      username: user.username,
      email: user.email,
      status: user.status,
      inviteCode: invite?.code || null,
      invitedByUserId: user.invitedByUserId || null,
      bindingCount,
      lastLoginAt: user.lastLoginAt || null,
      createdAt: user.createdAt,
    };
  }

  presentInvite(invite) {
    return {
      id: invite.id,
      code: invite.code,
      status: invite.status,
      maxUses: invite.maxUses,
      usedCount: invite.usedCount,
      remainingUses: Math.max(invite.maxUses - invite.usedCount, 0),
      ownerUserId: invite.ownerUserId || null,
      ownerUsername: this.users.find((item) => item.id === invite.ownerUserId)?.username || null,
      startsAt: invite.startsAt,
      expiresAt: invite.expiresAt,
      remark: invite.remark || null,
      createdAt: invite.createdAt,
    };
  }

  paginate(items, page, pageSize) {
    const start = (page - 1) * pageSize;
    return {
      items: items.slice(start, start + pageSize),
      page,
      pageSize,
      total: items.length,
    };
  }

  createUniqueInviteCode() {
    let candidate = '';
    do {
      candidate = crypto.randomBytes(4).toString('hex').toUpperCase();
    } while (this.invitationCodes.some((item) => item.code === candidate));
    return candidate;
  }

  toPositiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  businessError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }
}

if (require.main === module) {
  const service = new AdminPlayerInvitesService();
  service.seed();

  console.log('== list players ==');
  console.log(service.listPlayers({ keyword: 'steve' }));

  console.log('== player detail ==');
  console.log(service.getPlayerDetail('user_1'));

  console.log('== generate invite codes ==');
  console.log(service.generateInvitationCodes({ count: 2, maxUses: 3, remark: 'admin batch' }));
}

module.exports = { AdminPlayerInvitesService };
