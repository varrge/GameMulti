# 钱包、商城兑换、封禁联动基础模块草稿

## 交付范围

本轮先补齐三组后端基础骨架，方便后续直接接到真实仓库服务层：

1. **钱包与金币流水**
   - `Wallet`
   - `WalletTransaction`
   - 最小入账 / 扣减 / 幂等去重逻辑
2. **商城与订单兑换**
   - `RedeemItem`
   - `RedeemOrder`
   - `RedeemOrderItem`
   - `RewardDeliveryJob`
   - 最小下单扣币 / 创建发货任务流程
3. **封禁联动与审计**
   - `BanRecord`
   - `BanTarget`
   - `AuditLog`
   - 最小建单 / 下游同步 / 审计留痕流程

## 文件路径

- Prisma 草稿：`apps/api/schemas/wallet_and_redeem.prisma`
- 服务示例：`apps/api/examples/wallet_and_redeem_service.js`

## 数据模型设计要点

### 钱包与流水

- `Wallet` 以 `userId` 唯一约束保证单用户单币种主钱包
- `WalletTransaction` 记录余额变更前后值，便于审计与补偿
- 使用 `(walletId, idempotencyKey)` 做幂等去重，避免重复记账
- 预留 `referenceType/referenceId`，方便关联奖励、订单、人工补偿等业务来源

### 商城兑换

- `RedeemItem` 管商品主数据、库存、发货模版
- `RedeemOrder` 聚合订单级别状态
- `RedeemOrderItem` 保存商品快照，避免后续商品文案变更影响历史订单
- `RewardDeliveryJob` 独立承接发货异步任务，支持重试、锁定和去重

### 封禁联动与审计

- `BanRecord` 表示一次封禁动作主单据，支持 ban / unban / mute / kick / warn 扩展
- `BanTarget` 支持用户、游戏账号、服务器、设备、IP 等多种目标
- `AuditLog` 通用记录后台动作与下游同步结果，后续可扩展 traceId 串联整条链路
- `syncTrace` 字段用于保存论坛 / 游戏服等下游同步状态快照

## 最小流程说明

### 1. 钱包入账 / 扣减

```text
业务请求 -> 幂等键校验 -> 读取钱包 -> 校验余额 -> 写 wallet_transactions -> 更新 wallet.balance
```

### 2. 商城下单 / 发货

```text
选择商品 -> 校验库存 -> 扣减钱包余额 -> 创建 redeem_order + redeem_order_item -> 生成 reward_delivery_job -> 异步发货 -> 回写 delivered 状态
```

### 3. 封禁联动

```text
后台发起封禁 -> 创建 ban_record + ban_targets -> 写 audit_log -> 推送论坛/游戏服 -> 回写 syncTrace -> 记录同步审计
```

## 服务骨架说明

`apps/api/examples/wallet_and_redeem_service.js` 里提供了一个内存版示例服务：

- `creditWallet()` / `debitWallet()`：最小钱包记账骨架
- `createRedeemOrder()`：扣币 + 建单 + 生成发货任务
- `markDeliveryJobSucceeded()`：发货成功回写
- `createBanRecord()`：创建封禁单与审计记录
- `markBanSynced()`：下游同步结果回写与审计

这个实现不是生产代码，但已经把接口边界、状态流转和关键字段跑通，后续接 Prisma repository / queue worker 时可以直接照着拆。

## 后续接入建议

1. 把 `wallet_and_redeem.prisma` 合并进统一 schema，并补齐与 `User` / `GameAccount` / `GameServer` 的真实 relation
2. 给钱包更新加事务和乐观锁 / 行锁，避免并发扣币超卖
3. 为 `RewardDeliveryJob` 接入真实消息队列与重试策略
4. 为封禁同步补充论坛账号、游戏服插件、后台管理台三方 trace 关联
5. 增加订单取消 / 退款 / 发货失败补偿流程
