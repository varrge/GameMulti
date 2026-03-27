# Prisma Schema 初稿（结构示意）

> 说明：这是结构草稿，目的是帮助尽快启动后端建模，不代表最终字段类型与约束已经完全定稿。

```prisma
model User {
  id                String   @id @default(cuid())
  username          String?  @unique
  email             String?  @unique
  passwordHash      String?
  status            String
  invitedByUserId   String?
  invitationCodeId  String?
  lastLoginAt       DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  invitedBy         User?    @relation("UserInvites", fields: [invitedByUserId], references: [id])
  invitees          User[]   @relation("UserInvites")
}

model InvitationCode {
  id          String   @id @default(cuid())
  code        String   @unique
  createdBy   String
  ownerUserId String?
  batchId     String?
  maxUses     Int
  usedCount   Int      @default(0)
  expiresAt   DateTime?
  status      String
  remark      String?
  createdAt   DateTime @default(now())
}

model Game {
  id        String   @id @default(cuid())
  code      String   @unique
  name      String
  status    String
  createdAt DateTime @default(now())
}

model GameServer {
  id           String   @id @default(cuid())
  gameId       String
  serverCode   String   @unique
  serverName   String
  region       String?
  endpointHost String?
  endpointPort Int?
  adapterType  String?
  status       String
  meta         Json?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model GameAccount {
  id                   String   @id @default(cuid())
  gameId               String
  platform             String
  gameUserId           String
  displayName          String?
  normalizedGameUserId String
  extraMeta            Json?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
}

model UserGameBinding {
  id                  String   @id @default(cuid())
  userId              String
  gameAccountId       String
  serverId            String?
  bindStatus          String
  bindSource          String
  verifiedBy          String?
  verifiedAt          DateTime?
  unbindRequestedAt   DateTime?
  unbindApprovedAt    DateTime?
  unbindCooldownUntil DateTime?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}

model Wallet {
  id            String   @id @default(cuid())
  userId        String   @unique
  balance       Int      @default(0)
  frozenBalance Int      @default(0)
  status        String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model WalletTransaction {
  id             String   @id @default(cuid())
  walletId       String
  userId         String
  direction      String
  amount         Int
  balanceBefore  Int
  balanceAfter   Int
  businessType   String
  referenceType  String?
  referenceId    String?
  idempotencyKey String?
  remark         String?
  createdAt      DateTime @default(now())
}
```

## 后续补充建议

下一轮建模时应继续补全：
- `user_auth_accounts`
- `binding_sessions`
- `game_player_events`
- `game_play_sessions`
- `reward_rules`
- `coin_reward_settlements`
- `redeem_items`
- `redeem_orders`
- `redeem_order_items`
- `reward_delivery_jobs`
- `forum_accounts`
- `forum_sync_jobs`
- `ban_records`
- `ban_targets`
- `audit_logs`

