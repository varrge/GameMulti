# Local Discourse Dev Stack

This stack is the local gate before deploying Discourse to a server.

## Commands

```bash
cp infra/forum/discourse-dev/.env.example infra/forum/discourse-dev/.env
# Fill local SMTP/domain values in the ignored .env file.

bash infra/forum/discourse-dev/dev.sh pull
bash infra/forum/discourse-dev/dev.sh host
bash infra/forum/discourse-dev/dev.sh up
bash infra/forum/discourse-dev/dev.sh check
npm run check:local-discourse
```

The check script reports whether Discourse still needs first-run setup. A
reachable HTTP page is not enough for server deployment; complete the browser
SSO checklist in `docs/deployment/local_discourse_sso_validation.md` first.

Default URL:

```text
http://127.0.0.1:3000/
```

`DISCOURSE_HOSTNAME=127.0.0.1:3000` is the safest default for same-machine
local validation. `auto-public` resolves the current public IP at startup and
writes it to the ignored `.env.resolved` file used by Docker Compose, but it
only works if that public IP can route back to this machine. Use `auto-local`
for LAN testing, or set an explicit hostname for fixed DNS.

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
