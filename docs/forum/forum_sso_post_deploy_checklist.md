# Forum Bridge Post-Deploy Checklist

本清单只覆盖当前主线：Discourse 负责注册/登录，GameMulti Bridge 只负责插件 API
和绑定确认页。

## Runtime Shape

```text
https://forum.example.com
  Discourse registration, login, forum, admin

https://app.example.com
  GameMulti Bridge API
  /bind/confirm?token=...
  /api/auth/discourse/start
  /api/auth/discourse/callback
```

生产论坛不要启用 DiscourseConnect client 登录；否则论坛自己的登录/注册会被转交给
GameMulti 旧链路。

## Required Values

| Value | Example | Notes |
| --- | --- | --- |
| `PUBLIC_ORIGIN` | `https://app.example.com` | Bridge public origin |
| `BRIDGE_PUBLIC_ORIGIN` | `https://app.example.com` | Optional, defaults to `PUBLIC_ORIGIN` |
| `FORUM_ORIGIN` | `https://forum.example.com` | Discourse public origin |
| `FORUM_SSO_SECRET` | `openssl rand -hex 32` | Stored privately |
| `DISCOURSE_PROVIDER_SECRET` | same as `FORUM_SSO_SECRET` | Optional explicit split |
| `NEXT_PUBLIC_FORUM_ORIGIN` | `https://forum.example.com` | Optional, defaults to `FORUM_ORIGIN` |

## Discourse Settings

- Local logins: enabled.
- Registration/invites: configured in Discourse, not GameMulti.
- DiscourseConnect client login: disabled.
- DiscourseConnect provider: enabled.
- Provider secret entry: `app.example.com|<DISCOURSE_PROVIDER_SECRET>`.
- Default locale: `zh_CN` unless product requirements say otherwise.
- SMTP: working before production launch.

The helper script for this is:

```bash
bash infra/deploy/discourse_configure_sso.sh infra/deploy/discourse.env
```

## Bridge Checks

```bash
curl -I https://app.example.com/
curl -fsS https://app.example.com/api/healthz
npm run smoke:bridge-api
```

Expected:

- `/` returns the Bridge status page.
- `/api/healthz` returns success.
- `smoke:bridge-api` creates a plugin binding session and verifies the Discourse provider URL.
- Plugin binding session responses include `publicBindUrl`.

## Browser Flow

1. Create a real binding session from the plugin API and copy `publicBindUrl`.
2. Open `publicBindUrl` in a clean browser session.
3. Confirm the browser redirects to `https://forum.example.com/session/sso_provider?...`.
4. Login or register in Discourse.
5. Confirm Discourse returns to
   `https://app.example.com/api/auth/discourse/callback?sso=...&sig=...`.
6. Confirm Bridge returns to `/bind/confirm?token=...`.
7. Click confirm and verify the success page.
8. Verify the database has a `ForumAccount` mapping and
   `UserGameBinding.discourseUserId`.

## Failure Triage

| Symptom | First Check |
| --- | --- |
| Forum login redirects to GameMulti | DiscourseConnect client login is still enabled |
| Signature error after forum login | `DISCOURSE_PROVIDER_SECRET` mismatch |
| Callback 404/502 | `BRIDGE_PUBLIC_ORIGIN`, reverse proxy, API container health |
| Player gets internal URL | Plugin must show `publicBindUrl`, not a URL built from internal API base |
| Registration unavailable | Discourse registration/invite settings and SMTP |

## Exit Criteria

- Forum registration/login stays in Discourse.
- Binding login uses Discourse provider.
- Plugin receives and displays `publicBindUrl`.
- Browser binding flow succeeds end to end.
- Rollback path is documented in `docs/deployment/forum_production_launch_checklist.md`.
