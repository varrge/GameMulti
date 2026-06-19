# Local Discourse Dev Stack

This stack is the local gate before deploying Discourse to a server.

## Commands

```bash
cp infra/forum/discourse-dev/.env.example infra/forum/discourse-dev/.env
# Fill local SMTP/domain values in the ignored .env file.

bash infra/forum/discourse-dev/dev.sh pull
bash infra/forum/discourse-dev/dev.sh host
bash infra/forum/discourse-dev/dev.sh up
bash infra/forum/discourse-dev/dev.sh configure-local-sso
bash infra/forum/discourse-dev/dev.sh check
npm run check:local-discourse
```

The check script reports whether Discourse still needs first-run setup. A
reachable HTTP page is not enough for server deployment; complete the browser
SSO checklist in `docs/deployment/local_discourse_sso_validation.md` first.

Default URL:

```text
http://localhost/
```

`DISCOURSE_HOSTNAME=localhost` with `DISCOURSE_HTTP_PORT=80` is the safest
default for same-machine local validation. It avoids ports and dotted hostnames
in Discourse's local SVG sprite route. `auto-public` resolves the current public
IP at startup and writes it to the ignored `.env.resolved` file used by Docker
Compose, but it only works if that public IP can route back to this machine. Use
`auto-local` for LAN testing, or set an explicit hostname for fixed DNS.

Stop:

```bash
bash infra/forum/discourse-dev/dev.sh down
```

## Deployment Rule

Do not deploy a new forum setup to a server until this local stack can:

- pull all required images,
- start Postgres, Redis, and Discourse,
- return an HTTP response from the local Discourse URL,
- return a GameMulti SSO start URL that points to local Discourse,
- complete the local Discourse first-run wizard and enable DiscourseConnect,
- pass a real browser jump from GameMulti `/forums` into local Discourse,
- leave reproducible logs when it fails.

The local `.env` file is ignored and may contain real SMTP credentials. Never
commit it or paste its secret values into docs.

## Local SSO Bootstrap

After Discourse starts, run:

```bash
bash infra/forum/discourse-dev/dev.sh configure-local-sso
```

The command configures the local Discourse container for GameMulti:

- enables DiscourseConnect,
- sets the DiscourseConnect URL to `FORUM_SSO_RETURN_URL`,
- sets the shared secret from `FORUM_SSO_SECRET`,
- disables HTTPS forcing and the first-run wizard for local validation,
- disables external avatar fetching so local letter avatars do not depend on
  Discourse CDN URLs,
- promotes the local admin email if that user already exists.

For local browser validation, keep `FORUM_SSO_SECRET` aligned with
`infra/compose/.env`. The command does not create a missing admin user; if the
admin account does not exist yet, create it through the Discourse browser flow
and run the command again.
