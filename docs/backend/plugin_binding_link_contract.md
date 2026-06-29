# Plugin Binding Link Contract

## Decision

Game plugins should not construct player-facing binding links from their own API
base URL. The Bridge API returns the link the player should open.

`POST /api/plugin/bindings/session` returns:

```json
{
  "sessionId": "cmq...",
  "token": "token_xxx",
  "pairCode": "123456",
  "expiresIn": 300,
  "bindUrl": "/bind/confirm?token=token_xxx",
  "publicBindUrl": "https://app.example.com/bind/confirm?token=token_xxx"
}
```

## Plugin Behavior

- Show `publicBindUrl` to the player when present.
- Fall back to `bindUrl` only for older Bridge versions.
- Show `pairCode` together with the link, because some game chat clients make
  URLs hard to click.
- Treat the binding session as short lived. Current TTL is 300 seconds.
- Never expose `pluginClientSecret` in chat, logs, screenshots, or support
  messages.

Suggested player message:

```text
绑定码 123456，打开 https://app.example.com/bind/confirm?token=token_xxx 完成绑定。
```

## Why `publicBindUrl` Exists

In production the plugin may call an internal API address, while the player must
open the public Bridge address. Example:

```text
Plugin API target: http://gamemulti-api:3401
Player browser:    https://app.example.com
```

If the plugin builds links from the API target, players receive an unusable
internal URL. `publicBindUrl` is generated from `BRIDGE_PUBLIC_ORIGIN`,
`PUBLIC_ORIGIN`, or `APP_URL`, in that priority order.

## Acceptance Checks

- `npm run smoke:bridge-api` asserts that `publicBindUrl` points at the Bridge
  public origin.
- `npm --workspace plugin-poc/minecraft-js test` asserts that the PoC plugin
  prefers `publicBindUrl` over locally constructed URLs.
