# Edge Function API

HTTP reference for the Edge Functions in `supabase/functions/`. Everything here comes from the code. Where the
code does not say something, the entry says "not specified in code". All functions answer `OPTIONS` with 204
when they set CORS headers, and reject other methods with 405. Base URL: `https://<project-ref>.supabase.co/functions/v1/<name>`.

All functions are deployed with `verify_jwt = false` (`supabase/config.toml`), so each one checks auth itself.

---

## assistant-chat

**Purpose.** Runs the full assistant pipeline for one message without Meta: store, conversation, agent, stored
reply. Used by the dashboard's Assistant page ("Try your assistant") and by dev scripts.

**Method.** `POST` (JSON body). `OPTIONS` returns 204.

**Auth.** Two modes, chosen by whether the `x-playground-secret` header is present:

- Owner: `Authorization: Bearer <user JWT>`. The user must be a member of the store (`store_members`). Source `test`.
  The session is `test-<user id>-<session_id>`. A `session_id` that does not match `^[a-z0-9]{1,16}$` becomes `main`.
- Dev: `x-playground-secret: <PLAYGROUND_SECRET>`. The store id must be listed in `PLAYGROUND_STORE_IDS`. Source `dev`.
  `session_id` defaults to `default` and must match `^[\w-]{1,64}$`.

**Request body.** Common field: `store_id` (uuid, required). `action` is optional; default `chat`.

| `action` | Other fields | Effect |
| --- | --- | --- |
| `chat` (default) | `text` (string, 1 to 1000 characters after trim), `session_id` (optional string) | Runs the assistant on one message. |
| `reset` | `session_id` (optional) | Sets the test conversation back to `bot` and clears `handoff_reason`. |
| `usage` | none | Returns this month's usage. |

**Response.**

- `chat`: the result of `handleInbound` (`_shared/pipeline/`). On success the object has `ok: true` and the reply
  fields. The exact field list is not fully specified here; see `_shared/pipeline/reply.ts`. When the assistant
  sent product photos, `photos` lists them as `[{"url": "...", "name": "..."}]` (only the store's own photos in
  `product-images`). Real customers get them as separate image messages after the text reply.
- `reset`: `{"status": "bot"}`.
- `usage`: `{"usage": {...}}` from `getUsage`. The exact fields are not specified in this document.

**Errors.**

| Status | Body | When |
| --- | --- | --- |
| 400 | `Invalid JSON` | Body is not JSON. |
| 400 | `store_id must be a uuid` | Missing or malformed `store_id`. |
| 400 | `Unknown action` | `action` is not `chat`, `reset` or `usage`. |
| 400 | `session_id must be 1-64 chars of [A-Za-z0-9_-]` | Dev mode only: bad `session_id`. |
| 400 | `text must be 1-1000 characters` | `chat` with empty or too long text. |
| 401 | `Unauthorized` | Wrong `x-playground-secret`, or missing or invalid bearer token. |
| 403 | `This store is not in PLAYGROUND_STORE_IDS` | Dev mode for a store that is not allowed. |
| 403 | `Forbidden` | Owner mode: the user is not a member of the store. |
| 404 | `Store not found` | No such store. |
| 429 | `Too many test messages. Try again later.` | 60 or more `test`/`dev` runs for this store in the last hour. |
| 502 | `error` | The assistant run failed. The detail is returned only to dev callers; owners get `The assistant could not answer. Try again.` |
| 500 | `Something went wrong` | Unexpected error. |

**Notes.** Test and dev runs do not create real orders, do not change stock and do not count towards the monthly reply limit (from the function header comment).

**Agent eval.** `npm run eval` (`scripts/eval-agent.mjs`) sends 36 scenarios through this endpoint in dev mode, using
the seeded "Demo Boutique" store. It makes real model calls and costs tokens, and it shares the 60-per-hour cap above.
Run it only against a dedicated eval store (seed it, put only its id in `PLAYGROUND_STORE_IDS`), never a customer store.
The README section "Testing the agent (no Meta needed)" has the steps and the `EVAL_ONLY` option.

---

## deliver-messages

**Purpose.** Sends the outbound messages waiting in one conversation. The dashboard calls it right after the owner
writes a reply.

**Method.** `POST`.

**Auth.** `Authorization: Bearer <user JWT>`. The caller must be a member of the conversation's store. A missing,
unknown or foreign conversation returns the same 404, so ids cannot be probed.

**Request body.**

```json
{ "conversation_id": "<uuid>" }
```

**Response (200).** `DeliverResult`:

```json
{ "sent": 0, "failed": 0, "skipped": 0 }
```

**Errors.**

| Status | Body | When |
| --- | --- | --- |
| 400 | `Invalid JSON` | Body is not JSON. |
| 400 | `conversation_id must be a uuid` | Missing or malformed id. |
| 401 | `Unauthorized` | Missing or invalid bearer token. |
| 404 | `Not found` | No such conversation, or the caller is not a member of its store. |
| 500 | `Something went wrong` | Unexpected error. |

---

## instagram-connect

**Purpose.** Connects a store's Instagram professional account and disconnects it. Used by the dashboard
("Connect Instagram"). Instagram redirects the owner's browser back to this function; the function forwards the
code to the dashboard, and the dashboard finishes the connection with the owner's session.

**Method.** `GET` (Instagram redirect) and `POST` (JSON actions).

**Auth.**

- `GET`: none. It connects nothing. It only redirects.
- `POST` `start` and `disconnect`: `Authorization: Bearer <user JWT>` of a user whose `store_members.role` is `owner` for `store_id`.
- `POST` `finish`: `Authorization: Bearer <user JWT>`. The function checks that the state was started by the same user.

**Configuration.** Secrets `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`, `DASHBOARD_URL`
(optional `META_GRAPH_API_VERSION`). The redirect URI registered in Meta is `<SUPABASE_URL>/functions/v1/instagram-connect`.
If `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `SUPABASE_URL` or `CREDENTIALS_ENCRYPTION_KEY` is missing, `start` and `finish` return 503 `not_configured`.

### GET (redirect from Instagram)

Query: `code`, `state` (sent by Instagram on approval), or `error` (on cancel).

| Case | Response |
| --- | --- |
| Not configured | 302 to `<DASHBOARD_URL>/assistant?instagram=error&reason=not_configured` |
| `error` set, or `code` or `state` missing | 302 to `<DASHBOARD_URL>/assistant?instagram=error&reason=denied` |
| Otherwise | 302 to `<DASHBOARD_URL>/assistant?instagram=finish&code=<code>&state=<state>` |
| `DASHBOARD_URL` not set | 200, plain text message asking the owner to go back to the dashboard |

### POST `start`

Body: `{"action": "start", "store_id": "<uuid>"}`.

Response (200): `{"url": "<Instagram authorize URL>"}`. The state is signed with the app secret and binds the store and user.
Before returning the URL, the function checks that `CREDENTIALS_ENCRYPTION_KEY` works.

### POST `finish`

Body: `{"action": "finish", "code": "<string>", "state": "<string>"}`.

Response: always HTTP 200 for a completed attempt.

- Success: `{"ok": true}`, plus `"warning": "subscribe_failed"` when the account was connected but webhook subscription failed.
- Failure: `{"ok": false, "reason": "<reason>"}` with one of: `denied`, `invalid_state`, `not_owner`,
  `already_connected`, `instagram_error`, `server_error`.

### POST `disconnect`

Body: `{"action": "disconnect", "store_id": "<uuid>", "channel_id": "<uuid>"}`.

Response: `{"ok": true}`. Stops replies on that channel and deletes its stored token.

### Errors (POST)

| Status | Body | When |
| --- | --- | --- |
| 400 | `Invalid JSON` | Body is not JSON. |
| 400 | `store_id must be a uuid` | `start` or `disconnect` without a valid `store_id`. |
| 400 | `code and state are required` | `finish` without both strings. |
| 400 | `channel_id must be a uuid` | `disconnect` without a valid `channel_id`. |
| 400 | `Unknown action` | Unrecognized `action`. |
| 401 | `Unauthorized` | Missing or invalid bearer token. |
| 403 | `Forbidden` | `start` or `disconnect` by a user who is not an owner of the store. |
| 404 | `Not found` | `disconnect` for a channel that is not found. |
| 503 | `not_configured` | Missing Instagram or encryption configuration (`start`, `finish`). |
| 405 | `Method not allowed` | Methods other than GET, POST, OPTIONS. |
| 500 | `Something went wrong` | Unexpected error. |

---

## delivery-carrier

**Purpose.** Connects a store to its Yalidine Express account and keeps the store's `delivery_fees` in step with
Yalidine's prices. Used by the dashboard (Settings, Delivery tab).

**Method.** `POST` (JSON actions).

**Auth.** `Authorization: Bearer <user JWT>` of a user whose `store_members.role` is `owner` for `store_id`.

**Configuration.** Secret `CREDENTIALS_ENCRYPTION_KEY` (shared with `instagram-connect`). The API ID and token are
stored AES-GCM encrypted in `store_carriers` (server-only, no policies). The dashboard reads the connection status
through the `carrier_status(store_id)` RPC, which never returns the credentials.

### POST `connect`

`{"action":"connect","store_id","api_id","api_token","from_wilaya_id":16,"fee_type":"home"}` (`fee_type` is `home` or
`desk`, default `home`). Checks the credentials with Yalidine, saves them, then syncs. Answers
`{"ok":true,"added","updated","skipped"}` or `{"ok":false,"reason"}`.

### POST `sync`

`{"action":"sync","store_id","overwrite":false}`. Writes one price per wilaya (the most common commune price, in DA
stored as cents) into `delivery_fees` with `source = 'yalidine'`. Fees the owner typed (`source = 'manual'`) are kept
unless `overwrite` is `true`. Editing a synced fee in the dashboard turns it into a manual fee.

### POST `disconnect`

`{"action":"disconnect","store_id"}`. Deletes the stored credentials. Fees already copied stay.

### Errors

`400` bad input, `401` no or invalid JWT, `403` not an owner, `503 not_configured` (encryption key unusable).
Sync failures answer `200` with `{"ok":false,"reason"}`: `bad_credentials`, `rate_limited` (with `retryAfter` seconds),
`currency_mismatch` (store currency is not DZD), `not_connected`, `failed`. The last error is kept on the connection.

**Sources.** The response shape (`to_wilaya_name`, `per_commune` with `express_home`, `express_desk`, ...) comes from
the community SDK (npm `yalidine`), not from Yalidine's own docs. That shape has no wilaya id, so the destination is
resolved from its name. **Still unverified:** the fees path (`deliveryfees`, falling back to `fees`) and whether the
`from_wilaya_id` filter is honoured (rows naming another origin are skipped either way). Confirm with a real merchant
account before relying on synced prices.

## meta-webhook

**Purpose.** Receives Instagram DM webhooks from Meta. (The source comment mentions Messenger "later"; the code handles only what `parseWebhook` returns.)
It checks the signature, answers 200 at once, then stores the message, runs the assistant and sends the reply in the background.

**Method.** `GET` (verification handshake) and `POST` (events).

### GET (verification)

Query: `hub.mode`, `hub.verify_token`, `hub.challenge`.

| Case | Response |
| --- | --- |
| `hub.mode` is `subscribe` and `hub.verify_token` matches `META_WEBHOOK_VERIFY_TOKEN` | 200, body is the `hub.challenge` value |
| Otherwise (including when the token secret is unset) | 403 `Forbidden` |

### POST (events)

**Auth.** HMAC-SHA256 of the raw body in the `x-hub-signature-256` header (`sha256=<hex>`). The signature is
checked against `INSTAGRAM_APP_SECRET`, then `META_APP_SECRET`. Unset secrets are skipped.

**Request body.** Meta webhook payload. The parser is `_shared/meta/webhook.ts` (`parseWebhook`). Payload fields
are not listed here; see that file.

**Response.**

| Status | Body | When |
| --- | --- | --- |
| 200 | `OK` | Signature valid and body is JSON. Events, if any, are processed in the background. |
| 400 | `Bad request` | Signature valid but body is not JSON. |
| 401 | `Invalid signature` | Missing or malformed header, or no secret matches. |
| 405 | `Method not allowed` | Other methods. |

**Errors inside processing.** Failures for one event are logged and do not change the 200 response.

**Secrets used.** `META_WEBHOOK_VERIFY_TOKEN`, `INSTAGRAM_APP_SECRET`, `META_APP_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`,
`META_GRAPH_API_VERSION`, and the `LLM_*` secrets used by the assistant.

---

## playground-chat

**Purpose.** Retired. It is kept as a stub so old scripts get a clear message instead of a 404. Use `assistant-chat`.

**Method.** Any method.

**Auth.** None.

**Response.** Always `410 Gone`, body `{"error": "Moved to the assistant-chat function"}`, `content-type: application/json`.
It sets no CORS headers.

---

## telegram-webhook

**Purpose.** Receives updates from the Telegram bot. It links a store to an owner's Telegram chat when the owner
sends `/start <code>` (the code comes from the dashboard). The reply text is sent to the chat by
`_shared/telegram.ts`.

**Method.** `POST`. Other methods return 405 `Method not allowed`.

**Auth.** The `X-Telegram-Bot-Api-Secret-Token` header must equal `TELEGRAM_WEBHOOK_SECRET`, compared in constant
time. If that secret is unset, every request is rejected. Failure: 403 `Forbidden`.

**Request body.** A Telegram `Update` JSON. The function reads `message.chat.id` and `message.text`.

**Response.**

| Status | Body | When |
| --- | --- | --- |
| 200 | `OK` | Valid secret, including unreadable JSON (so Telegram does not retry) and updates that are ignored. |
| 403 | `Forbidden` | Missing or wrong secret header. |
| 405 | `Method not allowed` | Method other than POST. |

Processing runs in the background. If `TELEGRAM_BOT_TOKEN` is not set, the update is ignored. The link outcome
is one of `linked`, `unknown_code`, `ignored`, which is not returned in the HTTP response.

**Secrets used.** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`.
