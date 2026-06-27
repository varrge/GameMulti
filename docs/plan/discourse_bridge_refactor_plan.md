# Discourse Bridge Refactor Plan

## Decision

GameMulti should stop treating its own web app as the primary product shell. Discourse becomes the main user-facing system, while GameMulti is reduced to a bridge service for game integration.

```text
Discourse
  registration, invitations, login, forum, user admin, operational pages

GameMulti Bridge
  plugin API, binding sessions, binding confirmation pages, game account mapping,
  plugin events, server heartbeats
```

This keeps the platform smaller and removes duplicate account, invitation, and admin UI work.

## Target Ownership

| Area | Owner |
| --- | --- |
| User registration | Discourse invitations |
| User login | Discourse |
| User administration | Discourse Admin |
| Forum | Discourse |
| Rules, announcements, help pages | Discourse topics / Page Publishing |
| Game binding token creation | GameMulti Bridge |
| Game binding confirmation | GameMulti Bridge HTML page after Discourse SSO |
| Plugin authentication | GameMulti Bridge HMAC |
| Plugin replay protection | GameMulti Bridge nonce store |
| Game account mapping | GameMulti Bridge database |
| Events and heartbeats | GameMulti Bridge API |

## Runtime Shape

```text
forum.example.com
  Discourse official deployment

bridge.example.com or app.example.com
  GameMulti Bridge API
  Bridge Postgres
  optional nginx/caddy reverse proxy
```

The Bridge should not read the Discourse database directly. It trusts Discourse through signed DiscourseConnect provider callbacks and, later, the Discourse API where needed.

## New Login Flow

```text
player opens /bind/confirm?token=...
-> Bridge validates the binding session token
-> if no Bridge session, redirect to Discourse provider SSO
-> Discourse authenticates the user
-> Discourse redirects back to /api/auth/discourse/callback with signed payload
-> Bridge verifies signature and nonce
-> Bridge creates or updates a ForumAccount mapping and compatibility shadow user
-> Bridge sets an HttpOnly session cookie whose subject is the Discourse user ID
-> Bridge redirects back to /bind/confirm?token=...
-> user confirms binding
```

Game binding is `discourseUserId`-first. `UserGameBinding.discourseUserId` is the primary ownership key for new Bridge confirmations. `UserGameBinding.userId` and the local shadow `User` record remain as compatibility fields for old local auth routes, admin views, and existing data.

## Completed Refactor Slices

1. Add Bridge SSO endpoints:
   - `GET /api/auth/discourse/start`
   - `GET /api/auth/discourse/callback`
2. Add Bridge HTML binding page:
   - `GET /bind/confirm?token=...`
   - `POST /bind/confirm`
3. Keep plugin endpoints unchanged.
4. Keep the old Next app and old auth APIs in place temporarily.
5. Route `/bind/` to the API service in nginx.
6. Update deployment templates and docs so Discourse can be configured as an identity provider.
7. Move binding ownership to `discourseUserId`:
   - `UserGameBinding.discourseUserId`
   - `UserGameBinding.discourseUsername`
   - `UserGameBinding.discourseEmail`
   - `BindingSession.usedByDiscourseUserId`
   - `BindingSession.usedByDiscourseUsername`

## What Not To Do Yet

- Do not delete `apps/web` in the first slice.
- Do not remove every local `User` reference yet; keep compatibility until old auth/admin surfaces are retired.
- Do not build a custom Discourse plugin yet.
- Do not implement coins, shop, or reward settlement in this refactor slice.
- Do not depend on direct Discourse database reads.

## Acceptance Criteria

- A valid plugin-created binding token opens a Bridge-rendered confirmation page.
- An unauthenticated user is redirected to Discourse login.
- Discourse callback signature and nonce are verified.
- A Discourse user gets a `ForumAccount` mapping and compatibility shadow user.
- A logged-in Discourse user can confirm a binding.
- New binding records store and query ownership by `discourseUserId`.
- Expired, missing, or reused binding sessions do not confirm.
- Existing HMAC plugin API continues to work.
- Existing smoke tests for API and plugin paths still pass.

## Follow-Up Migration

After the first slice is verified on a real Discourse instance:

1. Replace local self-registration with Discourse-only registration in docs and UI.
2. Remove the self-auth pages from the public route map.
3. Backfill any legacy binding rows where `discourseUserId` is still empty.
4. Make `UserGameBinding.discourseUserId` required after backfill.
5. Add a tiny `/me/bindings` Bridge page if users need to review bindings outside Discourse.
6. Consider a Discourse theme component or plugin only if user profile integration becomes necessary.
