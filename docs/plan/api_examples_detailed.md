# API 示例请求 / 响应详细版

## 1. 插件：创建绑定会话

### 请求
`POST /api/plugin/bindings/session`

```json
{
  "serverCode": "mc_survival_01",
  "gameCode": "minecraft",
  "platform": "minecraft_uuid",
  "gameUserId": "550e8400-e29b-41d4-a716-446655440000",
  "displayName": "Steve",
  "bindMode": "link"
}
```

### 响应
```json
{
  "sessionId": "bs_001",
  "token": "token_xxx",
  "pairCode": "A7K29P",
  "expiresIn": 300,
  "bindUrl": "https://example.com/bind?token=token_xxx"
}
```

---

## 2. Web：根据 token 获取绑定会话

### 请求
`GET /api/bindings/session/by-token?token=token_xxx`

### 响应
```json
{
  "status": "pending",
  "gameCode": "minecraft",
  "serverName": "MC 生存一区",
  "displayName": "Steve",
  "expiresAt": "2026-03-27T12:00:00Z"
}
```

---

## 3. Web：通过配对码查询绑定会话

### 请求
`POST /api/bindings/session/by-pair-code`

```json
{
  "pairCode": "A7K29P"
}
```

### 响应
```json
{
  "sessionId": "bs_001",
  "status": "pending",
  "gameCode": "minecraft",
  "displayName": "Steve",
  "expiresAt": "2026-03-27T12:00:00Z"
}
```

---

## 4. Web：确认绑定

### 请求
`POST /api/bindings/confirm`

```json
{
  "sessionId": "bs_001"
}
```

### 响应
```json
{
  "success": true,
  "binding": {
    "gameCode": "minecraft",
    "platform": "minecraft_uuid",
    "gameUserId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

---

## 5. 插件：上报玩家事件

### 请求
`POST /api/plugin/events`

```json
{
  "serverCode": "mc_survival_01",
  "pluginClientId": "pc_001",
  "events": [
    {
      "eventUniqueKey": "evt_join_001",
      "eventType": "player_join",
      "eventTime": "2026-03-27T12:10:00Z",
      "platform": "minecraft_uuid",
      "gameUserId": "550e8400-e29b-41d4-a716-446655440000",
      "payload": {
        "displayName": "Steve"
      }
    }
  ]
}
```

### 响应
```json
{
  "accepted": 1,
  "duplicated": 0,
  "failed": 0
}
```

---

## 6. Web：获取钱包信息

### 请求
`GET /api/me/wallet`

### 响应
```json
{
  "balance": 1200,
  "frozenBalance": 0,
  "currency": "community_coin"
}
```

---

## 7. Web：创建兑换订单

### 请求
`POST /api/redeem/orders`

```json
{
  "items": [
    {
      "itemId": "item_vip_30d",
      "quantity": 1
    }
  ]
}
```

### 响应
```json
{
  "orderId": "ro_001",
  "orderNo": "GM202603270001",
  "status": "paid",
  "totalCost": 1000
}
```

---

## 8. Admin：创建封禁记录

### 请求
`POST /api/admin/bans`

```json
{
  "userId": "u_001",
  "scope": "global",
  "reason": "cheat",
  "endAt": "2026-04-01T00:00:00Z"
}
```

### 响应
```json
{
  "banId": "ban_001",
  "status": "active",
  "targets": [
    "site_login",
    "forum",
    "game_server"
  ]
}
```

