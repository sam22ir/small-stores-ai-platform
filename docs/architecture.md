# Architecture

## Flow

```
Customer DM (Instagram)
        │
        ▼
Meta webhook ──► POST /functions/v1/meta-webhook
                  1. verify X-Hub-Signature-256 (app secret), answer 200 at once
                  2. parse events; ignore echoes, self messages, deletions
                  3. resolve tenant: channels.external_id -> store (active channels only)
                        │  (background, EdgeRuntime.waitUntil)
                        ▼
                  ingestEvent (_shared/meta/ingest.ts)
                  - upsert customer + conversation, insert inbound message (retries find the same row)
                  - handleInbound: debounce, lock, limit, agent, run log (see below)
                  - deliverPending: claim each pending reply, send via graph.instagram.com, mark sent/failed
```

Meta expects a 200 within a few seconds, so the webhook acknowledges first and the pipeline runs in the background.
Owner replies are saved by the dashboard as `pending` and sent by the `deliver-messages` function it calls right after.
Setup and operations: [instagram-setup.md](instagram-setup.md).

## Agent tools (v0)

| Tool | Purpose |
|------|---------|
| `search_products(query)` | Fuzzy lookup in the store's catalog |
| `check_stock(product_id \| sku)` | Per-variant quantity and availability |
| `get_store_info()` | Hours, shipping, return policy set by the owner |
| `handoff_to_owner(reason)` | Flags the conversation `human`, notifies the owner, bot stops replying |
| `quote_delivery(wilaya)` | Delivery fee for a wilaya (only when the owner turned on order taking) |
| `create_order(...)` | Places a cash-on-delivery order through the `place_order` database function (order taking only) |

Implementation notes (`supabase/functions/_shared/agent/`):

- The agent loop is manual (`run.ts`), capped at 5 tool rounds, replies capped at 950 UTF-8 bytes (Instagram's text limit).
- A refusal, cut-off answer or exhausted loop never reaches the customer: the conversation is handed to the owner with a short holding reply.
- Stock is reported as `in_stock` / `low_stock` / `out_of_stock`. Exact counts are only exposed at 5 or fewer, so competitors can't read inventory by asking.
- Default model is `claude-sonnet-5-5` (`AGENT_MODEL` overrides) with low effort and the server-side refusal fallback enabled.
- Model providers can be chained (`providers.ts`): primary first, optional fallback on any error, with a short per-isolate circuit breaker. Falling back only protects uptime; whichever provider is primary still sees every message.
- `assistant-chat` (dashboard test chat with the owner's JWT, plus a dev-secret mode) and `meta-webhook` are entry points to the same pipeline in `_shared/pipeline.ts`. Delivery to Instagram is in `_shared/meta/` (`deliver.ts`, `instagram.ts`).

Orders: the model never supplies prices or the store id. `place_order` recomputes prices from the catalog, checks and
decrements stock under row locks, ignores duplicates (idempotency key) and runs as one transaction; test chats call it in
dry-run mode. A greeting/thanks fast path (`fastpath.ts`) answers without a model call.

Per-message reliability (`handleInbound`): debounce a burst, skip already-answered messages, hold a per-conversation lock (`claim_conversation` / `release_conversation`, expiring after 90 s), re-check state under the lock, and on a model outage send a localized holding reply and hand the chat to the owner. The owner's saved FAQ answers (`faq_entries`) are returned by `get_store_info`; product `aliases` and `sold_out_until` feed search and availability.

Every tool is scoped by `store_id` taken from the resolved channel, never from model
output, so one tenant can never read another's data.

## Multi-tenancy

- One `store` per tenant; `store_members` links Supabase Auth users to stores.
- RLS on every table via `is_store_member(store_id)`.
- The webhook worker uses the service role and always filters by `store_id` explicitly.
- Instagram access tokens live encrypted (AES-GCM) in `channel_credentials`, which has no client-facing policies. The key is an Edge Function secret, not in the database.

## Meta platform constraints to design around

- **24-hour window:** a business may reply freely only within 24h of the customer's last
  message (`conversations.last_customer_message_at`); `deliverPending` checks this and marks later replies `failed` with the reason.
- **App Review:** `pages_messaging` and `instagram_manage_messages` need Meta App Review
  and a Business-verified app before real stores can connect.
- **Instagram** requires a professional account linked to a Facebook Page.
- **Idempotency:** Meta retries webhooks; `messages.platform_message_id` is unique per channel.

## Agent guardrails

- Answer only from tool results; if stock/price is unknown, say so and offer handoff.
- Never promise delivery dates, discounts or reservations in v0.
- Rate-limit replies per conversation; stop replying once `status = 'human'`.
- Log every run (`agent_runs`) with tool calls for owner review and debugging.

## Roadmap

1. Schema + webhook receiver + signature verification
2. Agent loop with `search_products` / `check_stock`
3. Owner dashboard: connect Page/IG, catalog + stock CRUD (CSV import), conversation inbox
4. Handoff + notifications
5. Billing, onboarding, Meta App Review submission
