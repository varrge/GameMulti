# Forum Integration Next Step Plan

## Current Decision

Discourse is the primary user-facing system. GameMulti no longer owns public
registration, login, forum pages, or the main admin surface.

Current mainline:

```text
Plugin creates binding session
-> Bridge returns pairCode + publicBindUrl
-> player opens /bind/confirm?token=...
-> Bridge redirects to Discourse provider login
-> Discourse returns to /api/auth/discourse/callback
-> Bridge confirms binding against discourseUserId
```

## Completed

- Default deployment starts Bridge API, Postgres, and Nginx only.
- Old Next web service is opt-in through the `web` profile.
- Local Discourse can be started for validation.
- Discourse local login/register stays in Discourse.
- Bridge auth uses Discourse provider `/session/sso_provider`.
- Binding ownership is `discourseUserId` first.
- Plugin HMAC signing, nonce replay protection, binding session creation,
  events, and heartbeat have protocol-level tests.
- Binding session responses now include `publicBindUrl` for player-facing links.

## Next Priority

1. Keep cleaning deployment/docs drift so production instructions only describe
   the current Bridge-provider flow.
2. Push the latest commits to the remote branch before server deployment, because
   `infra/deploy/update.sh` pulls from git.
3. Provision production infrastructure:
   - Discourse domain, DNS, SMTP, TLS
   - Bridge domain, DNS, TLS/reverse proxy
   - private env files for both sides
4. Deploy Bridge and Discourse.
5. Run browser validation with a real plugin-created `publicBindUrl`.

## Plugin Link Scope

The plugin link is required now, but the scope should stay narrow:

- The Bridge API owns URL generation through `publicBindUrl`.
- The plugin displays `publicBindUrl` plus `pairCode`.
- The plugin does not decide forum login URLs.
- The plugin does not read or write Discourse directly.
- A real Paper/Java plugin can come after the production Bridge/forum path is
  stable.

Detailed contract: `docs/backend/plugin_binding_link_contract.md`.

## Not Next

- Do not re-enable GameMulti-as-provider forum login in production.
- Do not deploy the old Next web app by default.
- Do not start wallet, shop, rewards, or ban sync before the deployable
  Bridge/forum/plugin-link path is stable.
- Do not write a full Paper plugin until the HTTP contract has survived one real
  server deployment.
