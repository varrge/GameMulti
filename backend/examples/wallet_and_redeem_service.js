/**
 * 钱包、订单兑换、封禁联动示例服务。
 *
 * 目标：
 * 1. 演示 wallets / wallet_transactions 的最小记账闭环
 * 2. 演示 redeem_items / redeem_orders / reward_delivery_jobs 的最小兑换流程
 * 3. 演示 ban_records / ban_targets / audit_logs 的最小封禁联动流程
 */
class GameMultiOpsService {
  constructor(now = () => new Date()) {
    this.now = now;
    this.wallets = [];
    this.walletTransactions = [];
    this.redeemItems = [];
    this.redeemOrders = [];
    this.redeemOrderItems = [];
    this.deliveryJobs = [];
    this.banRecords = [];
    this.banTargets = [];
    this.auditLogs = [];
  }

  seed() {
    this.wallets.push({
      id: 'wallet_1',
      userId: 'user_1',
      currency: 'coin',
      balance: 200,
      frozenBalance: 0,
      status: 'active',
      version: 1,
      createdAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    });

    this.redeemItems.push({
      id: 'item_1',
      itemCode: 'minecraft_vip_7d',
      title: 'Minecraft VIP 7天',
      itemType: 'virtual_reward',
      gameCode: 'minecraft',
      price: 120,
      currency: 'coin',
      stock: 50,
      stockReserved: 0,
      deliveryType: 'game_plugin',
      deliveryTemplate: { command: 'grant-vip', durationDays: 7 },
      status: 'active',
      sortOrder: 100,
      createdAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    });
  }

  getWalletByUserId(userId) {
    const wallet = this.wallets.find((item) => item.userId === userId);
    if (!wallet) {
      throw this.businessError('WALLET_NOT_FOUND', `Wallet not found for user ${userId}`);
    }
    return wallet;
  }

  creditWallet({ userId, amount, businessType, referenceType, referenceId, idempotencyKey, remark }) {
    return this.applyWalletTransaction({
      userId,
      direction: 'credit',
      amount,
      businessType,
      referenceType,
      referenceId,
      idempotencyKey,
      remark,
    });
  }

  debitWallet({ userId, amount, businessType, referenceType, referenceId, idempotencyKey, remark }) {
    return this.applyWalletTransaction({
      userId,
      direction: 'debit',
      amount,
      businessType,
      referenceType,
      referenceId,
      idempotencyKey,
      remark,
    });
  }

  applyWalletTransaction({ userId, direction, amount, businessType, referenceType, referenceId, idempotencyKey, remark }) {
    if (!userId || !direction || !Number.isInteger(amount) || amount <= 0 || !businessType) {
      throw this.businessError('INVALID_ARGUMENT', 'Invalid wallet transaction arguments');
    }

    if (idempotencyKey) {
      const existing = this.walletTransactions.find((item) => item.idempotencyKey === idempotencyKey);
      if (existing) return existing;
    }

    const wallet = this.getWalletByUserId(userId);
    const signedAmount = direction === 'debit' ? -amount : amount;
    const nextBalance = wallet.balance + signedAmount;
    if (nextBalance < 0) {
      throw this.businessError('INSUFFICIENT_BALANCE', 'Wallet balance is insufficient');
    }

    const transaction = {
      id: `txn_${this.walletTransactions.length + 1}`,
      walletId: wallet.id,
      userId,
      direction,
      amount,
      balanceBefore: wallet.balance,
      balanceAfter: nextBalance,
      frozenBefore: wallet.frozenBalance,
      frozenAfter: wallet.frozenBalance,
      businessType,
      referenceType: referenceType || null,
      referenceId: referenceId || null,
      idempotencyKey: idempotencyKey || null,
      status: 'confirmed',
      operatorId: 'system',
      operatorType: 'service',
      remark: remark || null,
      createdAt: this.now().toISOString(),
    };

    wallet.balance = nextBalance;
    wallet.version += 1;
    wallet.updatedAt = this.now().toISOString();
    this.walletTransactions.push(transaction);

    return transaction;
  }

  createRedeemOrder({ userId, itemCode, quantity = 1, targetIdentifier }) {
    const item = this.redeemItems.find((entry) => entry.itemCode === itemCode && entry.status === 'active');
    if (!item) {
      throw this.businessError('ITEM_NOT_FOUND', `Redeem item ${itemCode} not found`);
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw this.businessError('INVALID_QUANTITY', 'quantity must be positive integer');
    }
    if (Number.isInteger(item.stock) && item.stock - item.stockReserved < quantity) {
      throw this.businessError('OUT_OF_STOCK', 'redeem item stock is insufficient');
    }

    const wallet = this.getWalletByUserId(userId);
    const totalAmount = item.price * quantity;
    const orderId = `order_${this.redeemOrders.length + 1}`;
    const orderNo = `RO${String(this.redeemOrders.length + 1).padStart(6, '0')}`;

    this.debitWallet({
      userId,
      amount: totalAmount,
      businessType: 'redeem_order_pay',
      referenceType: 'redeem_order',
      referenceId: orderId,
      idempotencyKey: `redeem:${orderId}:pay`,
      remark: `Redeem ${item.title}`,
    });

    item.stockReserved += quantity;

    const order = {
      id: orderId,
      orderNo,
      userId,
      walletId: wallet.id,
      totalAmount,
      currency: item.currency,
      status: 'paid',
      deliveryStatus: 'pending',
      createdAt: this.now().toISOString(),
      paidAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    };
    this.redeemOrders.push(order);

    const orderItem = {
      id: `order_item_${this.redeemOrderItems.length + 1}`,
      orderId,
      itemId: item.id,
      quantity,
      unitPrice: item.price,
      totalPrice: totalAmount,
      itemSnapshot: {
        itemCode: item.itemCode,
        title: item.title,
        deliveryType: item.deliveryType,
      },
      deliverySnapshot: {
        targetIdentifier,
        template: item.deliveryTemplate,
      },
      deliveryStatus: 'pending',
      createdAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    };
    this.redeemOrderItems.push(orderItem);

    const job = {
      id: `job_${this.deliveryJobs.length + 1}`,
      orderId,
      orderItemId: orderItem.id,
      itemId: item.id,
      userId,
      deliveryChannel: item.deliveryType,
      targetType: 'game_account',
      targetIdentifier,
      payload: {
        itemCode: item.itemCode,
        quantity,
        template: item.deliveryTemplate,
      },
      dedupeKey: `delivery:${orderItem.id}`,
      status: 'pending',
      attemptCount: 0,
      maxAttempts: 5,
      createdAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    };
    this.deliveryJobs.push(job);

    return { order, orderItem, job };
  }

  markDeliveryJobSucceeded(jobId) {
    const job = this.deliveryJobs.find((entry) => entry.id === jobId);
    if (!job) throw this.businessError('DELIVERY_JOB_NOT_FOUND', `Job ${jobId} not found`);

    job.status = 'succeeded';
    job.attemptCount += 1;
    job.deliveredAt = this.now().toISOString();
    job.updatedAt = this.now().toISOString();

    const orderItem = this.redeemOrderItems.find((entry) => entry.id === job.orderItemId);
    if (orderItem) {
      orderItem.deliveryStatus = 'delivered';
      orderItem.updatedAt = this.now().toISOString();
    }

    const order = this.redeemOrders.find((entry) => entry.id === job.orderId);
    if (order) {
      order.deliveryStatus = 'delivered';
      order.status = 'delivered';
      order.deliveredAt = this.now().toISOString();
      order.updatedAt = this.now().toISOString();
    }

    return job;
  }

  createBanRecord({ actionType = 'ban', scope = 'global', reason, operatorId, targets = [], expiresAt }) {
    if (!reason || !targets.length) {
      throw this.businessError('INVALID_ARGUMENT', 'Ban reason and targets are required');
    }

    const banRecord = {
      id: `ban_${this.banRecords.length + 1}`,
      banNo: `BAN${String(this.banRecords.length + 1).padStart(6, '0')}`,
      actionType,
      scope,
      reason,
      status: 'active',
      severity: 1,
      sourceSystem: 'admin_console',
      sourceReferenceId: null,
      triggeredByUserId: operatorId || 'system',
      approvedByUserId: operatorId || 'system',
      effectiveAt: this.now().toISOString(),
      expiresAt: expiresAt || null,
      syncTrace: { forum: 'pending', gameServer: 'pending' },
      createdAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    };
    this.banRecords.push(banRecord);

    const banTargets = targets.map((target, index) => ({
      id: `ban_target_${this.banTargets.length + index + 1}`,
      banRecordId: banRecord.id,
      targetType: target.targetType,
      targetValue: target.targetValue,
      normalizedValue: String(target.targetValue).toLowerCase(),
      gameCode: target.gameCode || null,
      serverCode: target.serverCode || null,
      metadata: target.metadata || null,
      createdAt: this.now().toISOString(),
    }));
    this.banTargets.push(...banTargets);

    const auditLog = this.writeAuditLog({
      actorId: operatorId || 'system',
      actorType: 'admin',
      action: `ban.${actionType}`,
      resourceType: 'ban_record',
      resourceId: banRecord.id,
      result: 'success',
      requestPayload: { reason, targets },
      responsePayload: { status: banRecord.status },
      banRecordId: banRecord.id,
      remark: 'Created ban record and queued downstream sync',
    });

    return { banRecord, banTargets, auditLog };
  }

  markBanSynced(banRecordId, systemName, result = 'success', detail = {}) {
    const banRecord = this.banRecords.find((entry) => entry.id === banRecordId);
    if (!banRecord) {
      throw this.businessError('BAN_RECORD_NOT_FOUND', `Ban record ${banRecordId} not found`);
    }

    banRecord.syncTrace = {
      ...(banRecord.syncTrace || {}),
      [systemName]: {
        result,
        detail,
        at: this.now().toISOString(),
      },
    };
    banRecord.status = result === 'success' ? 'active' : 'sync_failed';
    banRecord.updatedAt = this.now().toISOString();

    return this.writeAuditLog({
      actorId: 'system',
      actorType: 'service',
      action: 'ban.sync',
      resourceType: 'ban_record',
      resourceId: banRecordId,
      result: result === 'success' ? 'success' : 'failed',
      requestPayload: { systemName },
      responsePayload: detail,
      banRecordId,
      remark: `Ban sync ${systemName} => ${result}`,
    });
  }

  writeAuditLog({ actorId, actorType, action, resourceType, resourceId, result, requestPayload, responsePayload, banRecordId, remark }) {
    const log = {
      id: `audit_${this.auditLogs.length + 1}`,
      traceId: `trace_${this.auditLogs.length + 1}`,
      actorId: actorId || null,
      actorType,
      action,
      resourceType,
      resourceId,
      result,
      requestPayload: requestPayload || null,
      responsePayload: responsePayload || null,
      banRecordId: banRecordId || null,
      remark: remark || null,
      createdAt: this.now().toISOString(),
    };
    this.auditLogs.push(log);
    return log;
  }

  listWalletTransactions(userId) {
    return this.walletTransactions.filter((item) => item.userId === userId);
  }

  listRedeemOrders(userId) {
    return this.redeemOrders.filter((item) => item.userId === userId);
  }

  listBanRecords() {
    return this.banRecords.map((record) => ({
      ...record,
      targets: this.banTargets.filter((target) => target.banRecordId === record.id),
    }));
  }

  businessError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }
}

if (require.main === module) {
  const service = new GameMultiOpsService();
  service.seed();

  console.log('== wallet credit ==');
  console.log(service.creditWallet({
    userId: 'user_1',
    amount: 80,
    businessType: 'manual_adjust',
    referenceType: 'admin_ticket',
    referenceId: 'ticket_1',
    idempotencyKey: 'wallet:user_1:ticket_1',
    remark: 'Compensation',
  }));

  console.log('== redeem order ==');
  const redeem = service.createRedeemOrder({
    userId: 'user_1',
    itemCode: 'minecraft_vip_7d',
    quantity: 1,
    targetIdentifier: 'minecraft:Steve',
  });
  console.log(redeem);

  console.log('== delivery success ==');
  console.log(service.markDeliveryJobSucceeded(redeem.job.id));

  console.log('== create ban ==');
  const ban = service.createBanRecord({
    reason: 'Cheating detected',
    operatorId: 'admin_1',
    targets: [
      { targetType: 'user', targetValue: 'user_1' },
      { targetType: 'game_account', targetValue: 'minecraft:Steve', gameCode: 'minecraft', serverCode: 'survival-1' },
    ],
  });
  console.log(ban);

  console.log('== sync ban ==');
  console.log(service.markBanSynced(ban.banRecord.id, 'minecraft_plugin', 'success', { appliedTargets: 1 }));
}

module.exports = { GameMultiOpsService };
