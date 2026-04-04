# Admin 玩家查询与邀请码管理基础模块

## 目标

先把后台 Admin MVP 最常用的两块能力沉淀成可继续开发的后端骨架：

1. **玩家查询**：支持按用户名 / 邮箱 / 游戏账号 / 服务器 / 邀请码检索
2. **邀请码管理**：支持列表查看、状态筛选、批量生成

这版先不绑定具体框架，但把 **接口契约、数据模型、索引方向、最小示例** 补齐，后续无论落到 NestJS、Fastify 还是 Express 都能直接接。

## 交付结构

```text
apps/api/
  contracts/
    admin_player_invites.openapi.yaml
  schemas/
    admin_player_invites.prisma
  examples/
    admin_player_invites_service.js
```

## 能力范围

### 1. 玩家列表

建议支持的筛选条件：

- `keyword`：模糊匹配用户名、邮箱、游戏账号名、邀请码
- `status`：账号状态
- `gameCode`
- `serverCode`
- `inviteCode`
- `page / pageSize`

列表项聚合字段建议至少包括：

- 用户基础信息
- 注册来源邀请码
- 绑定数量
- 最近登录时间
- 注册时间

### 2. 玩家详情

详情页先聚合基础信息即可：

- 用户资料概览
- 使用的邀请码
- 当前游戏绑定列表
- 最近奖励结算（先预留字段，方便后续接奖励模块）

### 3. 邀请码管理

先覆盖两类动作：

- 列表查看：按状态、归属人、关键词筛选
- 批量生成：一次生成一批邀请码，并保留 batch / remark / owner 归档信息

## 数据建模建议

### 1. 用户查询索引

`User` 模型至少建议有：

- `@@index([status, createdAt])`
- `@@index([lastLoginAt])`

后续若接 PostgreSQL 全文检索，可考虑把 `username/email` 做 trigram 索引或搜索投影表。

### 2. 邀请码批次

新增 `InvitationCodeBatch`，解决两个后台问题：

- 批量生成后可追踪本次发放的来源
- 便于后续做导出、撤销、统计

### 3. 绑定聚合

Admin 查询本质上是 `User + InvitationCode + UserGameBinding + GameAccount + GameServer` 的组合查询。

因此这版 schema 特意把这些关系模型和索引补齐，方便后续真正写列表 SQL / ORM 查询。

## 最小实现约束

### 玩家列表接口

- 返回统一分页结构：`items/page/pageSize/total`
- 关键词为空时走普通列表，不强制全文搜索
- 优先按注册时间倒序

### 邀请码生成接口

- `count` 限制最大 500，避免后台误操作
- `maxUses` 限制最大 1000
- code 统一大写
- 生成时必须避免重复

## 后续接线点

1. 把 `examples/admin_player_invites_service.js` 迁移成真实 application service
2. 将 Prisma 草稿并入主 schema，补 migration
3. 在 Admin 前端对接玩家搜索页和邀请码页
4. 详情页补充钱包、奖励、封禁审计等更多聚合块
