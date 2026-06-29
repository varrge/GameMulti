# Plugin Install Token Flow

## Decision

Unknown Minecraft servers must not auto-register anonymously. Admin creates a
short-lived install token first; a new plugin uses that token once to claim a
server record and receive its own `clientKey` / `clientSecret`.

## Flow

1. Admin opens `/api/admin/plugin-client-generator`.
2. Admin enters `ADMIN_API_KEY` and creates an install token.
3. Server owner installs the plugin with:

```yaml
apiBaseUrl: "https://app.example.com"
installToken: "gmit_xxx"
serverName: "Survival 01"
publicHost: "mc.example.com"
publicPort: 25565
```

4. Plugin calls:

```text
POST /api/plugin/installations/claim
```

5. Bridge creates:

```text
GameServer(status=pending)
ServerPluginClient(status=active)
```

6. The claim response returns `clientKey` and `clientSecret` once.
7. Admin reviews the server list and sets the server to `active` or `blocked`.
8. Only `active` servers can use signed plugin APIs.

## Security Notes

- The install token is stored as a SHA-256 hash and can be used once.
- The plugin secret is encrypted at rest and is only returned in the claim
  response.
- Server IP / host is display and risk context only. Authorization uses
  `clientKey` / `clientSecret`, not IP.
