# Discourse binding flow

## Scope

This contract covers the server-side path from a plugin-created binding session through Discourse identity authentication and final binding confirmation. Bridge remains one deployable service and PostgreSQL is the authority for transient context and final binding state.

## Flow

1. An authenticated plugin creates a five-minute `BindingSession`. The plugin client `gameId` and `serverId` are authoritative; mismatched request fields are rejected.
2. `/api/auth/discourse/start` accepts only `/bind/confirm?token=...` or `/bind/account` as `returnTo`. The account path accepts no parameters. The confirmation path accepts only one canonical `token`; all other parameters are discarded. Cross-origin, protocol-relative, credentialed, fragmented, oversized, malformed, or unrelated destinations become `/`.
3. For a binding return target, Bridge stores only the SHA-256 digest of a random nonce plus the immutable purpose, original `BindingSession.id`, original `serverId`, and an expiry no later than the session expiry. Starting authentication again invalidates the previous nonce.
4. The browser receives an HttpOnly, signed, short-lived state cookie containing the nonce, purpose, binding session id, server id, canonical return target, and expiry. Discourse receives the nonce in its signed SSO payload.
5. The callback verifies the Discourse signature, signed state shape/signature/expiry, and nonce. It rejects a purpose, session, or server mismatch. Bridge resolves the stable Discourse `external_id`, then atomically clears the single-use context and records `authenticatedDiscourseUserId` and the original server id. A replay cannot find or consume the context again.
6. Confirmation requires the same pending, unexpired session. The Bridge page path additionally requires prior Discourse authentication, the same `discourseUserId`, and the same server context. The transaction rejects an account already actively bound to another identity and records the session as `conflict`; otherwise it records the binding and consumes the session as `bound`.

## Public status mapping

Binding session reads expose both `sessionStatus` (the database enum) and the stable P0 product status. Pending authentication progress is represented by `nextAction`, not by introducing extra product statuses.

| Product status | Meaning | Recoverable | Next action |
| --- | --- | --- | --- |
| `pending` | Session awaits Discourse authentication or confirmation | yes | `authenticate_with_discourse` or `confirm_binding` |
| `bound` | Binding transaction completed | no | `enter_game_or_community` |
| `expired` | Session enum or wall-clock expiry is reached | yes | `start_new_binding` |
| `cancelled` | User or operator cancelled the operation | yes | `return_to_source` |
| `conflict` | Game account has another owner or conflicting data | yes | `contact_operations_or_unbind` |
| `revoked` | Binding was unbound or administratively revoked | yes | `rebind_or_view_reason` |
| `denied` | Identity, server, or operation permission is insufficient | yes | `view_authorization_requirements` |
| `unavailable` | A required Bridge, Discourse, or game dependency is temporarily unavailable | yes | `retry_later` |

Only Bridge writes these states. A successful Discourse callback does not mean `bound`; it leaves the product status `pending` and changes only the next action.

## Failure behavior

- Invalid Discourse signature, signed state, expiry, or nonce returns 401/4xx and does not create a Bridge browser session.
- Missing context, replay, tampered purpose/session/server, cross-session use, cross-server use, and cross-user confirmation are rejected.
- Wall-clock expiry is persisted as `expired`. Ownership conflict is persisted as `conflict` before the caller receives the 4xx response, so plugin polling observes the prescribed terminal result.
- Expired sessions recover by requesting a new plugin-generated link. Conflict, revoked, denied, and unavailable results expose the recovery actions in the table above.

## Automated coverage

Service-level tests cover context consumption and replay, expired context, purpose/session/server tampering, matching confirmation, cross-user confirmation, and conflict persistence. Focused tests cover all P0 status mappings and exact `returnTo` path/parameter canonicalization.

## Deployment

The Prisma schema adds nullable authentication-context columns and enum values to `BindingSession`, so existing rows remain valid. Generate Prisma Client and apply the reviewed migration chain before deploying the API. The repository migration directory is `apps/api/prisma/migrations/`; it starts with the `20260817100000_baseline` snapshot, followed by the timestamped incremental migrations through `20260817113000_add_binding_auth_context`, and ends with `20260817114000_complete_head_schema`. Local compose may use `prisma db push` for development, but production must run `prisma migrate deploy` and complete the full reviewed chain before starting API code that uses the new enum values or columns.
