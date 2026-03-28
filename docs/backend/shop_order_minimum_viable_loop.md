# 商城与订单最小可运行闭环

## 本轮交付目标

在现有钱包/兑换骨架基础上，补齐一条可本地验证的最小商城闭环，覆盖：

1. 商品定义：`RedeemItem`
2. 下单扣费：`createRedeemOrder()`
3. 订单项快照：`RedeemOrderItem`
4. 发货任务创建：`RewardDeliveryJob`
5. 发货完成回写：`markDeliveryJobSucceeded()`

这轮重点是把“商品 -> 下单 -> 扣币 -> 建单 -> 创建发货任务 -> 回写交付结果”这条链跑通，方便后续接 Prisma、HTTP API 和异步队列。

## 交付文件

- 数据模型：`backend/schemas/wallet_and_redeem.prisma`
- 服务示例：`backend/examples/wallet_and_redeem_service.js`
- 交付说明：`docs/backend/shop_order_minimum_viable_loop.md`

## 代码映射

### 1. 商品主数据

位于 `backend/schemas/wallet_and_redeem.prisma`：

- `RedeemItem`：商品编码、价格、库存、发货模版、状态

位于 `backend/examples/wallet_and_redeem_service.js`：

- `seed()`：预置 `minecraft_vip_7d` 商品，包含价格、库存、发货模版

### 2. 下单与扣费

位于 `backend/examples/wallet_and_redeem_service.js`：

- `createRedeemOrder()`
  - 校验商品存在且处于 `active`
  - 校验购买数量合法
  - 校验可用库存
  - 调用 `debitWallet()` 扣减钱包余额
  - 生成订单号 `RO000001` 这类最小订单编号

### 3. 订单与订单项

位于 `backend/schemas/wallet_and_redeem.prisma`：

- `RedeemOrder`：订单主单据
- `RedeemOrderItem`：订单项快照与交付快照

位于 `backend/examples/wallet_and_redeem_service.js`：

- `createRedeemOrder()` 中创建：
  - `order`
  - `orderItem`

订单项里保留：

- 商品快照 `itemSnapshot`
- 发货快照 `deliverySnapshot`

这样后续即使商品标题、模版变化，历史订单仍可追溯。

### 4. 发货任务

位于 `backend/schemas/wallet_and_redeem.prisma`：

- `RewardDeliveryJob`：发货通道、目标、重试、锁定、去重字段

位于 `backend/examples/wallet_and_redeem_service.js`：

- `createRedeemOrder()` 内生成 `job`
  - `deliveryChannel=game_plugin`
  - `targetType=game_account`
  - `dedupeKey=delivery:<orderItemId>`

### 5. 发货完成回写

位于 `backend/examples/wallet_and_redeem_service.js`：

- `markDeliveryJobSucceeded()`
  - 把任务状态改成 `succeeded`
  - 回写订单项 `deliveryStatus=delivered`
  - 回写订单 `status=delivered`

## 本地验证方式

在仓库根目录执行：

```bash
node backend/examples/wallet_and_redeem_service.js
```

### 预期可以看到的最小链路

1. 钱包补偿入账成功
2. 创建兑换订单成功
3. 生成订单项与发货任务成功
4. 标记发货成功后，订单状态更新为 `delivered`

### 本次实际验证

已执行：

```bash
node backend/examples/wallet_and_redeem_service.js
```

观察到的关键结果：

- 成功生成订单 `order_1 / RO000001`
- 成功生成订单项 `order_item_1`
- 成功生成发货任务 `job_1`
- 发货回写后任务状态变为 `succeeded`
- 订单状态从 `paid` 更新为 `delivered`

## 当前覆盖范围

已经覆盖：

- 单商品购买
- 钱包扣费
- 订单与订单项创建
- 发货任务生成
- 发货成功状态回写
- 基础库存校验
- 钱包余额不足拦截

暂未覆盖：

- 多商品购物车
- 订单取消/退款
- 发货失败重试调度
- 并发扣库存与事务保护
- HTTP API / 控制器层
- 数据库真实持久化

## 后续接入建议

1. 把示例服务拆成 `catalog / order / delivery` 三个 service
2. 用 Prisma 事务包裹“扣币 + 扣库存 + 建单”
3. 将 `RewardDeliveryJob` 接入真实队列消费者
4. 为订单补齐取消、退款、补偿和失败重试
5. 增加 `GET /api/redeem/items`、`POST /api/redeem/orders`、`GET /api/redeem/orders/{id}` 等接口
