/**
 * 奖励规则与结算链路内存版示例。
 *
 * 目标：
 * 1. 演示 reward_rules 如何基于事件匹配
 * 2. 演示 settlement 幂等去重和钱包入账对接点
 * 3. 给后续接真实 repository / ledger service 一个最小骨架
 */
class RewardSettlementService {
  constructor(now = () => new Date()) {
    this.now = now;
    this.rewardRules = [];
    this.settlements = [];
    this.walletLedger = [];
  }

  seed() {
    this.rewardRules.push({
      id: 'rule_1',
      name: '首杀僵尸奖励',
      gameCode: 'minecraft',
      eventType: 'mob_kill',
      rewardType: 'coin',
      rewardValue: 10,
      priority: 100,
      triggerWindowSeconds: null,
      matcher: { mobType: 'zombie' },
      payoutConfig: { ledgerScene: 'game_reward' },
      status: 'active',
      remark: 'MVP sample rule',
      createdAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    });
  }

  listRules(query = {}) {
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = Math.min(this.toPositiveInt(query.pageSize, 20), 100);

    const items = this.rewardRules
      .filter((rule) => {
        if (query.gameCode && rule.gameCode !== query.gameCode) return false;
        if (query.eventType && rule.eventType !== query.eventType) return false;
        if (query.status && rule.status !== query.status) return false;
        return true;
      })
      .sort((a, b) => a.priority - b.priority);

    return this.paginate(items, page, pageSize);
  }

  createRule(input) {
    if (!input?.name || !input?.gameCode || !input?.eventType || !input?.matcher) {
      throw this.businessError('INVALID_ARGUMENT', 'Missing required rule fields');
    }
    if (!Number.isInteger(input.rewardValue) || input.rewardValue <= 0) {
      throw this.businessError('INVALID_REWARD_VALUE', 'rewardValue must be positive integer');
    }

    const rule = {
      id: `rule_${this.rewardRules.length + 1}`,
      name: input.name,
      gameCode: input.gameCode,
      eventType: input.eventType,
      rewardType: input.rewardType || 'coin',
      rewardValue: input.rewardValue,
      priority: Number.isInteger(input.priority) ? input.priority : 100,
      triggerWindowSeconds: input.triggerWindowSeconds ?? null,
      matcher: input.matcher,
      payoutConfig: input.payoutConfig || {},
      status: input.status || 'draft',
      remark: input.remark || null,
      createdAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    };
    this.rewardRules.push(rule);
    return rule;
  }

  evaluateEvent({ gameCode, eventType, eventPayload }) {
    const matchedRules = this.rewardRules
      .filter((rule) => rule.status === 'active' && rule.gameCode === gameCode && rule.eventType === eventType)
      .filter((rule) => this.matchPayload(rule.matcher, eventPayload))
      .sort((a, b) => a.priority - b.priority);

    return {
      matchedRules: matchedRules.map((rule) => rule.id),
      outputs: matchedRules.map((rule) => ({
        ruleId: rule.id,
        amount: rule.rewardValue,
        currency: rule.rewardType,
        reason: `${rule.eventType}:${JSON.stringify(rule.matcher)}`,
      })),
    };
  }

  settleEvent({ userId, gameCode, eventType, sourceEventId, idempotencyKey, eventPayload }) {
    if (!userId || !gameCode || !eventType || !idempotencyKey) {
      throw this.businessError('INVALID_ARGUMENT', 'Missing settlement arguments');
    }

    const existing = this.settlements.find((item) => item.idempotencyKey === idempotencyKey);
    if (existing) {
      return { deduplicated: true, settlements: [existing] };
    }

    const evaluation = this.evaluateEvent({ gameCode, eventType, eventPayload });
    if (evaluation.outputs.length === 0) {
      const skipped = {
        id: `settlement_${this.settlements.length + 1}`,
        ruleId: null,
        userId,
        gameCode,
        eventType,
        sourceEventId: sourceEventId || null,
        idempotencyKey,
        amount: 0,
        currency: 'coin',
        status: 'skipped',
        walletLedgerId: null,
        eventPayload,
        evaluationTrace: evaluation,
        failureReason: null,
        processedAt: this.now().toISOString(),
        createdAt: this.now().toISOString(),
      };
      this.settlements.push(skipped);
      return { deduplicated: false, settlements: [skipped] };
    }

    const created = evaluation.outputs.map((output) => {
      const settlement = {
        id: `settlement_${this.settlements.length + 1}`,
        ruleId: output.ruleId,
        userId,
        gameCode,
        eventType,
        sourceEventId: sourceEventId || null,
        idempotencyKey: `${idempotencyKey}:${output.ruleId}`,
        amount: output.amount,
        currency: output.currency,
        status: 'credited',
        walletLedgerId: this.creditWallet({ userId, amount: output.amount, reason: output.reason }),
        eventPayload,
        evaluationTrace: output,
        failureReason: null,
        processedAt: this.now().toISOString(),
        createdAt: this.now().toISOString(),
      };
      this.settlements.push(settlement);
      return settlement;
    });

    return { deduplicated: false, settlements: created };
  }

  listSettlements(query = {}) {
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = Math.min(this.toPositiveInt(query.pageSize, 20), 100);
    const items = this.settlements.filter((item) => {
      if (query.userId && item.userId !== query.userId) return false;
      if (query.gameCode && item.gameCode !== query.gameCode) return false;
      if (query.eventType && item.eventType !== query.eventType) return false;
      if (query.status && item.status !== query.status) return false;
      if (query.idempotencyKey && item.idempotencyKey !== query.idempotencyKey) return false;
      return true;
    });
    return this.paginate(items, page, pageSize);
  }

  matchPayload(matcher, payload) {
    return Object.entries(matcher || {}).every(([key, value]) => payload?.[key] === value);
  }

  creditWallet({ userId, amount, reason }) {
    const ledgerId = `ledger_${this.walletLedger.length + 1}`;
    this.walletLedger.push({
      id: ledgerId,
      userId,
      amount,
      currency: 'coin',
      direction: 'credit',
      scene: 'reward_rule',
      reason,
      createdAt: this.now().toISOString(),
    });
    return ledgerId;
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
  const service = new RewardSettlementService();
  service.seed();

  console.log('== evaluate ==');
  console.log(service.evaluateEvent({ gameCode: 'minecraft', eventType: 'mob_kill', eventPayload: { mobType: 'zombie' } }));

  console.log('== settle ==');
  console.log(service.settleEvent({
    userId: 'user_1',
    gameCode: 'minecraft',
    eventType: 'mob_kill',
    sourceEventId: 'evt_1',
    idempotencyKey: 'minecraft:evt_1:user_1',
    eventPayload: { mobType: 'zombie' },
  }));

  console.log('== settlements ==');
  console.log(service.listSettlements({ userId: 'user_1' }));
}

module.exports = { RewardSettlementService };
