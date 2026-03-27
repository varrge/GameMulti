# 奖励规则与结算基础模块

## 目标

在钱包模块和活动/事件系统真正落地前，先把 **奖励规则** 与 **奖励结算记录** 这一层抽出来，沉淀成可继续演进的后端骨架。

本稿先覆盖：

- `reward_rules` 规则模型
- `coin_reward_settlements` 结算记录模型
- 事件试算与最小结算链路
- 钱包入账对接点

## 交付结构

```text
backend/
  contracts/
    reward_settlement.openapi.yaml
  schemas/
    reward_settlement.prisma
  examples/
    reward_settlement_service.js
```

## 业务链路

### 1. 配置奖励规则

后台创建或维护奖励规则，核心字段：

- 游戏编码 `gameCode`
- 事件类型 `eventType`
- 匹配器 `matcher`
- 奖励值 `rewardValue`
- 优先级 `priority`
- 生效状态 `status`

### 2. 事件试算

收到游戏事件后，先跑一遍 evaluator：

1. 过滤同游戏、同事件类型、状态为 `active` 的规则
2. 按 matcher 匹配 payload
3. 输出命中的规则和预期奖励

### 3. 正式结算

最小链路建议：

1. 用 `idempotencyKey` 去重
2. 事件命中规则后创建 settlement
3. 调钱包 ledger service 记一笔 credit
4. settlement 记录钱包流水 ID
5. 若没有命中规则，也落一条 `skipped`，方便审计

## 数据模型说明

### RewardRule

核心字段：

- `matcher`：Json，存事件匹配条件
- `payoutConfig`：Json，存币种/场景/标签等扩展配置
- `status`：`draft / active / disabled`
- `priority`：多规则命中时的排序依据

### CoinRewardSettlement

核心字段：

- `idempotencyKey`：同一事件结算幂等键
- `sourceEventId`：原始事件 ID
- `walletLedgerId`：钱包入账后的流水 ID
- `evaluationTrace`：本次命中或跳过的诊断数据
- `failureReason`：失败原因

## 为什么要单独落 settlement

如果只靠钱包流水，很难回答这些后台问题：

- 这笔币是哪个规则发的？
- 哪类事件命中率最高？
- 同一事件有没有重复结算？
- 为什么某条事件没有奖励？

所以 settlement 层建议独立存在，钱包账本只负责“钱真的加上去了”。

## 最小实现约束

### 幂等

每次结算必须带 `idempotencyKey`。

推荐拼法：

```text
{gameCode}:{sourceEventId}:{userId}
```

如果一个事件可能命中多条规则，示例里把最终落库 key 扩成：

```text
{idempotencyKey}:{ruleId}
```

这样既能保留“同事件”的聚合语义，也能允许一对多规则结算。

### 跳过也留痕

没有命中规则时，不要静默吞掉，建议创建 `skipped` 记录，后续做后台排查会省很多事。

## 后续接线点

1. 接入真实钱包 ledger service
2. 给 reward rule 增加时间窗、渠道、服务器范围等条件
3. 增加失败重试与补偿任务
4. 在 Admin 端补规则页、试算页、结算明细页
