# Local Discourse Dev Stack

This stack is the local gate before deploying Discourse to a server.

## Commands

```bash
cp infra/forum/discourse-dev/.env.example infra/forum/discourse-dev/.env
# Fill local SMTP/domain values in the ignored .env file.

bash infra/forum/discourse-dev/dev.sh pull
bash infra/forum/discourse-dev/dev.sh up
bash infra/forum/discourse-dev/dev.sh check
npm run check:local-discourse
```

Default URL:

```text
http://127.0.0.1:3000/
```

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
- leave reproducible logs when it fails.

The local `.env` file is ignored and may contain real SMTP credentials. Never
commit it or paste its secret values into docs.
