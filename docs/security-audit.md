# Security audit: edge functions and RLS

Scope: `supabase/functions/*` (+ `_shared`), `supabase/migrations/*.sql`. Done by reading the code; no
live project was queried and no migration was applied. `supabase/config.toml` does not exist in the repo.
Deno is not installed here, so function code was not type-checked or run; `npm test` (node `--test`,
covers `_shared`) passes 193/193.

## A. Edge functions

| Item | Status | Severity | file:line | Fix |
|---|---|---|---|---|
| assistant-chat owner auth: JWT via `auth.getUser`, then store membership checked before any work | OK | - | assistant-chat/index.ts:79-89 | - |
| assistant-chat dev mode: constant-time compare (SHA-256 digests); fails closed when `PLAYGROUND_SECRET` unset | OK | - | assistant-chat/index.ts:47-69 | - |
| assistant-chat dev mode is one shared secret that can act on any store_id (no per-store scoping) | Issue | Medium | assistant-chat/index.ts:68-74 | Keep for dev only; set a strong secret in prod or remove dev mode from the deployed function. Not changed (by design). |
| assistant-chat store_id always from request body but checked against membership (owner) or trusted only with dev secret | OK | - | assistant-chat/index.ts:106-130 | - |
| assistant-chat returns `result.error` to client on 502 | Unverified | Low | assistant-chat/index.ts:230 | Return a fixed message; log the detail. Not checked (pipeline error text not inspected). |
| deliver-messages: JWT via `getUser`, conversation -> store -> membership check, same 404 for missing/not-yours | OK | - | deliver-messages/index.ts:165-190 | - |
| deliver-messages CORS `*` | OK | - | deliver-messages/index.ts:153-157 | Bearer auth, no cookies, so acceptable. |
| instagram-connect start/disconnect: owner role required (`ownerOf`), store_id/channel_id validated as uuid | OK | - | instagram-connect/index.ts:73-81, 121-143 | - |
| instagram-connect finish: signed state (HMAC, 10 min TTL) must match the JWT user; code only redeemed by the same owner | OK | - | _shared/meta/connect.ts:47-48 | - |
| instagram-connect disconnect: channel update not scoped by store (select was scoped) | Issue | Low | _shared/meta/connect.ts:146 | FIXED: added `.eq("store_id", storeId)` to the update. |
| instagram-connect GET redirect puts one-time OAuth `code` in dashboard URL query | Issue | Low | instagram-connect/index.ts:95 | Code is single-use and redeemed only by the owner's session; accepted risk. Could move to a POST-based hand-off. |
| instagram-connect missing secrets: `not_configured` 503, GET redirect with error | OK | - | instagram-connect/index.ts:37-48, 91, 108 | - |
| meta-webhook POST: HMAC-SHA256 verified with `crypto.subtle.verify` (constant time); no secret configured => 401 | OK | - | _shared/meta/webhook.ts:83-98 | - |
| meta-webhook GET handshake verify token compared with `===` (not constant time) | Issue | Low | meta-webhook/index.ts:57 | FIXED: constant-time compare via digests. |
| meta-webhook replay/idempotency: Meta `mid` stored with unique (channel_id, platform_message_id); 23505 treated as duplicate | OK | - | _shared/meta/ingest.ts:89-117; migrations/0001_init.sql:117-120 | - |
| meta-webhook store/tenant id derived from the connected channel (external id lookup), not from body | OK | - | _shared/meta/ingest.ts | - |
| meta-webhook uses service role; queries keyed by channel/external id from the verified payload | OK | - | meta-webhook/index.ts:24-37 | - |
| telegram-webhook: `X-Telegram-Bot-Api-Secret-Token` compared in constant time; empty secret => 403 (fail closed) | OK | - | _shared/telegram.ts:77-86; telegram-webhook/index.ts:109 | - |
| telegram `/start <code>` link code is single-use (cleared on link), unknown/reused code rejected | OK | - | _shared/telegram.ts:108-109 | - |
| telegram-webhook replay: update_id not stored; a replayed `/start` with a used code is a no-op | OK | Info | telegram-webhook/index.ts:113-126 | - |
| playground-chat: 410 stub, no logic | OK | - | playground-chat/index.ts:1-10 | - |
| Generic error messages to clients ("Something went wrong") on the other paths | OK | - | deliver-messages:195, instagram-connect:148, assistant-chat:234 | - |
| `supabase/config.toml` missing: `verify_jwt` per function is not in the repo, so the deployed setting is unknown. Functions that rely on self-auth (`meta-webhook`, `telegram-webhook`, `instagram-connect`, `deliver-messages`, `assistant-chat`) need `verify_jwt = false` or Meta/Telegram calls get rejected | Issue | Medium | supabase/ (no config.toml) | Commit a `supabase/config.toml` with `[functions.<name>] verify_jwt = false` for the self-auth functions, or confirm the dashboard setting. Not created here: a partial config can break `supabase` CLI commands, so this needs a human decision. |

## B. RLS, grants and functions

| Item | Status | Severity | file:line | Fix |
|---|---|---|---|---|
| RLS enabled on every public table (stores, store_members, channels, channel_credentials, products, product_variants, customers, conversations, messages, agent_runs, delivery_fees, orders, order_items, faq_entries, store_telegram) | OK | - | migrations/0001_init.sql:140-149; 0010:72-74; 0013:46; 0016:14 | - |
| Policies scope by membership (`is_store_member(store_id)`), not `auth.uid() is not null` | OK | - | migrations/0001_init.sql:151-170; 0010:76-79; 0013:47-48 | - |
| No `using (true)` on writes | OK | - | all migrations (grep) | - |
| `channel_credentials` and `store_telegram` have RLS and no policies; client grants revoked | OK | - | migrations/0001_init.sql:143; 0016:14-15 | - |
| SECURITY DEFINER functions set `search_path` and check membership (`create_store` checks auth.uid(); `set_order_status`, `telegram_link/unlink` check membership) | OK | - | migrations/0008:33-53; 0010:173-188; 0016:18-45 | - |
| `touch_updated_at` trigger function callable by API roles (EXECUTE to PUBLIC by default) | Issue | Low | migrations/0009_advisor_fixes.sql:3-4 (function from 0008:56) | FIXED in `0018_security_audit_fixes.sql`: revoke EXECUTE from public, anon, authenticated. |
| `place_order`, `claim_conversation`, `release_conversation` executable only by service_role | OK | - | migrations/0010:169-170; 0011:95-96; 0013:25-28 | 0013 `create or replace` keeps the 0011 ACL, so the grant still holds. |
| `is_store_member` / `is_store_owner` (public and private) revoked from anon | OK | - | migrations/0002:5-6; 0008:29-30; 0009:25-28 | - |
| Grants to anon: none on any public table (all revoked) | OK | - | migrations/0008:6-8 | - |
| Grants to authenticated are column/row-limited (stores update limited columns, conversations status/handoff only, no client write on orders/agent_runs/customers/store_members) | OK | - | migrations/0008:11-19; 0010:16,81-82; 0014:6 | - |
| Realtime publication contains only `conversations`; RLS applies to realtime changes | OK | - | migrations/0017_realtime_conversations.sql:3 | Keep `messages` out of the publication unless it gets a store-scoped policy and column review. |
| Views use `security_invoker` | OK (none exist) | - | migrations (grep: no `create view`) | Add `with (security_invoker = true)` to any future view. |
| Composite FKs prevent cross-tenant child rows | OK | - | migrations/0004_tenant_integrity.sql:1-23 | - |

## Verification

- `npm test` (root, node --test over `_shared`, agent and meta tests): 193 pass, 0 fail.
- `deno test` not run: deno is not installed in this environment.
- No migration applied, nothing deployed.
