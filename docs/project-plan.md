# Project plan and decisions

Last updated: 2026-10-05 (Instagram connection built). Items marked **(decision)** were agreed in conversation; **(open)** are not settled.

## Product

- **What:** an AI agent that answers customers' DMs for small, often solo, stores that sell on **Instagram and Facebook Pages**. Target market first: **Algeria** (Darija, French, Arabic, cash on delivery).
- **v0 scope (decision):** check store stock and prices, answer from the store's own catalog and info, hand the conversation to the owner when it can't help.
- **Orders (added, off by default):** when the owner switches on "Take orders in chats", the assistant collects name, phone, wilaya and address, quotes the delivery fee, asks the customer to confirm, then places a **cash-on-delivery** order. No online payments.
- **Meta (Instagram/Facebook) connection comes last (decision).** Until then everything is tested through the `assistant-chat` function (dashboard "Try your assistant" page, or the dev secret).

## Architecture (decision)

- TypeScript. Supabase (Postgres, Auth, RLS, Edge Functions) for data and the agent. See [architecture.md](architecture.md).
- Dashboard: static web app hosted on **Cloudflare** (free plan), talking straight to Supabase. Cloudflare **R2** later for customers' voice notes and images.
- Agent code lives in `supabase/functions/_shared/agent/`; unit tests run with `npm test` (no network).
- Multi-tenant: one store per tenant, RLS on every table, composite `(id, store_id)` foreign keys so rows can't cross tenants.

## Model providers (decision)

- **Default in code: Claude (Anthropic).** `DEFAULT_MODEL = "claude-sonnet-5-5"` in `_shared/agent/run.ts`, used when `LLM_PROVIDER` is not `openai-compatible` (`_shared/pipeline/reply.ts`). It needs `ANTHROPIC_API_KEY`.
- **Optional: an OpenAI-compatible endpoint.** Set `LLM_PROVIDER=openai-compatible` to use `chat_completions.ts`, with the chain built in `providers.ts`. It is not the default and nothing in the repo points it at a specific host. Examples that were considered (not configured as the default):
  1. **Third-party endpoint** (the "friend's endpoint"), `https://codex-everywhere.com/v1`, model `gpt-6-luna`. Planned/optional only.
  2. **Official OpenAI**, `https://api.openai.com/v1`, model `gpt-6-luna`. Also optional only.
- Fallback rule (for the OpenAI-compatible chain): the primary gets one 20 s attempt; on any error the same message goes to the fallback. After 3 consecutive primary failures the primary is skipped for 60 s.
- GPT-6 Luna on Chat Completions only supports function calling with `reasoning_effort = none`, and wants `max_completion_tokens`. Both are configurable per provider.
- Secrets (Supabase Edge Function secrets, never in the repo): `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_TOKEN_PARAM`, `LLM_REASONING_EFFORT`, and the same with `LLM_FALLBACK_` for the fallback. `PLAYGROUND_SECRET` protects the dev mode of `assistant-chat`. See `.env.example`.
- Free models (TokenRouter, OpenRouter) were used **only to test the pipeline**. Their results say nothing about the final model.
- **(open) Third-party endpoint:** if the friend's endpoint is ever set as the `LLM_` primary, it would see every customer message. Get its terms in writing, keep prepaid credit small, and treat the fallback as protection for uptime only, not privacy. This is not the current default.

## Pricing and economics

Full numbers in [economics.md](economics.md). Summary:

- **(decision, owner's number)** Charge about **1,000 DA per store per month** (about $3.86 at 256-260 DA per dollar).
- Money flow: the owner buys dollars at ~256 DA ($10 for 2,560 DA) and loads them as credit on the friend's platform.
- At realistic volumes the AI cost is tiny; risk is concentrated in very busy stores, so each store has a **monthly reply limit** (`stores.monthly_reply_limit`, default 1,000, changed by us, not the owner). Only customer replies answered by the model count: greetings/thanks (free fast path), failed runs and dashboard test chats don't. At the limit the customer gets a holding message and the chat goes to the owner. Top-up packs and pricing in DA are still **(open)**.
- Competitor Chatbot DZ sells prepaid "tokens" with no subscription; see [competitors.md](competitors.md).

### Reply credits

Extra AI replies a store can buy on top of its monthly plan (migration 0023, `stores.reply_credits`).

- **Packs** (price in DZD, set on the server in `_shared/billing.ts` `CREDIT_PACKS`, never taken from the client): 500 replies for 300 DA, 2,000 for 1,000 DA, 5,000 for 2,000 DA. The owner picks a pack in `billing-checkout` with `{"store_id", "pack"}`; no `pack` means the monthly subscription.
- **Paid by:** a Chargily checkout, applied by the webhook through `apply_paid_checkout` in one transaction (the payment claim and the credit grant succeed or fail together; a repeat is a no-op).
- **Spent:** only once the included monthly replies are used. One credit per customer reply, taken just before the model call (`consume_reply_credit`, never below zero). If the reply fails, the credit is given back (`add_reply_credits`). A failed or unavailable credit check hands the chat to the owner rather than answering for free.
- **Exempt from the monthly token cap:** a credit-paid reply is recorded with `agent_runs.used_credit = true` and left out of the token sum. It still counts as a reply. The token cap still blocks a store that has credits.
- Only customer replies use credits. Test chats and the dashboard never spend them.

## Android app and notifications (decision: build in stages)

1. **Telegram alert** to the owner on handoff (days of work).
2. **Installable web app (PWA) with push notifications**, built from the dashboard. Android is ~89% of mobile in Algeria (StatCounter, June 2026).
3. **Native Android app** (React Native / Expo, Firebase push) once stores are using it. Check Google Play requirements for Algerian developers first.

App features: instant handoff alerts, inbox of handed-off chats, quick stock edits, pause the bot, daily summary; owner replies later (subject to Meta's reply-window rules).

## Roadmap

Done:
- Schema, RLS, demo store ("Demo Boutique"), catalog and stock.
- Agent: `search_products`, `check_stock`, `get_store_info`, `handoff_to_owner`; plural-aware search; hidden exact stock above 5; reply length cap; safe handoff on refusals or cut-off answers.
- Meta webhook function (signature check, idempotent storage), not connected to Meta yet.
- Provider chain with fallback, repeatable eval script (`npm run eval`, 12 scenarios incl. Darija/French/Latin-script), 83 unit tests (agent, tools, orders, fast path, language, usage, and the whole pipeline including locks, debounce and outages against a fake database) plus 15 dashboard unit tests (stock-list importer, store-info composer).
- **Owner dashboard** (`apps/dashboard`): sign-in, store setup, chats inbox with owner replies and hand-back, **orders** (confirm / ship / deliver / cancel with stock returned), catalog with one-tap stock edits, **Assistant page** (monthly usage meter, "Try your assistant" test chat, channels), settings with **order-taking switch and delivery fees per wilaya**, Arabic/French/English with RTL, installable app. Static, deploys to Cloudflare Pages. 82 browser checks against a mock backend; not yet run against the live Supabase project or deployed.
- **Orders backend (migrations 0010-0011):** `orders`, `order_items`, `delivery_fees`; `place_order` runs in one transaction (price from the catalog, stock checked and decremented with row locks, idempotent, dry-run mode for test chats) and is callable only by the server; `set_order_status` lets owners move an order along and returns stock on cancel. Phone numbers are validated as Algerian mobiles.
- **Zero-cost fast path:** greetings and thanks (Arabic, French, English, Darija in Latin letters) are answered without a model call. "ok"/"yes" are never fast-pathed because they can confirm an order.
- **Holding replies are localized** (Arabic, French incl. Latin-script Darija, English) when the model can't answer or the monthly limit is hit.
- **Getting started (migration 0014):** a setup checklist on the Chats page (add 3+ products, fill in store info, try the assistant; order taking and connecting Instagram/Facebook are listed as optional/coming soon) with a progress bar, a "Next" marker and a ready/hide state; the catalog nudges the owner to try the assistant once products exist; "What the assistant should know" is now labelled fields (hours, delivery, payment, returns, address, anything else) with examples, composed into `business_info` and kept as `business_info_fields`; sign-in by emailed link as well as password.
- **Reliability (migration 0013):** when the model is down a real customer still gets a holding reply in their language and the chat goes to the owner's "Needs you" list (the Chats page shows a banner counting these failures); test chats show the error instead. Every message goes through `handleInbound`'s wrapper: optional **debounce** (a burst of messages is answered once, together; the Meta webhook should pass `debounceMs: 4000`), skip a message that already has a reply (webhook redelivery), a **per-conversation lock** (`claim_conversation`) so two replies are never written at once, and a re-check once the lock is held (owner took over, newer message arrived).
- **"Teach it" loop:** the owner can save any of their own replies as an answer the assistant uses next time ("Save as an answer" under their message in a chat, or add/edit/delete in Settings → "Answers the assistant knows"). Stored in `faq_entries`, returned by `get_store_info` (newest 40, size-capped), and the prompt tells the model to call it first for anything that isn't a specific product. Products also have **aliases** ("kapuchon, sweat, هودي") that count like the name in search.
- **Stock accuracy:** **Import stock list** (paste from a spreadsheet or upload a CSV; updates existing products by name and option, adds new ones; columns in any order, header optional, `,` `;` or tab); each product shows when its stock was last updated and is flagged after 14 days, with a banner and "Mark all as checked" (`stock_checked_at`); **Sold out today** sets `sold_out_until` (end of today) without erasing the count, and both the assistant's answers and `place_order` honour it.
- **Instagram connection (migration 0015; built, not yet deployed or tried live):** "Connect Instagram" in the dashboard (Instagram Login, least-privilege scopes, signed state, 60-day token encrypted at rest and auto-refreshed), `meta-webhook` now runs the whole pipeline in the background (debounce 4 s) and `deliver-messages`/`deliverPending` send replies (atomic claim so nothing is sent twice, 24-hour window check, long replies split, failures shown to the owner as "Not delivered"). Public `/privacy`, `/terms`, `/data-deletion` pages for Meta (operator name and email come from `VITE_LEGAL_*`). Tests: 46 new unit tests in `_shared/meta/`, browser checks now 96. The three Edge Function entry points could not be run here (no Deno), only typechecked; the first live run is the real check. Setup steps: [instagram-setup.md](instagram-setup.md).
- **One pipeline** (`_shared/pipeline.ts`) used by `assistant-chat` now and the Meta webhook later: fast path, monthly limit, history, provider chain, run logging, handoff.
- Security/performance advisors cleaned up (migrations 0009, 0012). What remains is intentional: `channel_credentials` has RLS and no policy on purpose (server only); `create_store`, `set_order_status` and the two `is_store_*` helpers are SECURITY DEFINER functions that signed-in users are meant to call (the helpers are needed by RLS); the "unused index" notices are just because there is no traffic yet.

Next, in this order (open). Items marked **needs you** require your accounts or approval:
1. ~~Fix the database security policies~~ done with migration `0008`.
2. **needs you:** Telegram handoff alert (bot token).
3. **needs you:** deploy the dashboard to Cloudflare Pages and try it with a real account (first live run of sign-up, store creation, RLS, the test chat, orders). Then push notifications.
4. ~~Darija / French / Arabic-in-Latin-letters scenarios in the eval script~~ done.
5. ~~Usage counting per store, caps~~ done. **needs you:** pricing in DA via Chargily Pay (account).
6. ~~Rule-based fast path~~ done. Voice notes and images still to do.
7. **needs you:** Meta connection. Code is done (see above). To go live for a **pilot with testers** (no Business Verification or App Review needed while every connecting account has a role on the app): apply migration 0015, set the secrets, deploy the three functions and the dashboard, then do the Meta dashboard steps in [instagram-setup.md](instagram-setup.md). **Business Verification and App Review** are needed only to open the app to stores that are not testers; the owner has registered as an auto-entrepreneur (card pending, activity 021620 "Développeur d'application") for that.
8. **needs you:** Google sign-in (create a Google OAuth client and enable the provider in Supabase), and a custom email sender for production (Supabase's built-in sender is rate-limited to a few emails per hour, which would limit email-link sign-ins).
9. **needs you:** run `npm run eval` on the real GPT-6 Luna chain, and a native-speaker pass over the Arabic and French dashboard text.

## Known issues

- **Security is done with privileges (migration `0008`), not policy rewrites.** The old broad "for all" RLS policies remain, but clients can only do what `0008` grants: read their own rows, edit store settings, hand conversations back, add owner replies, manage the catalog. Checked with simulated users (cross-tenant reads, writes, the composite-FK trick, anonymous access). Server-only tables (`channels`, `customers`, `agent_runs`, `channel_credentials`) are not writable by clients. Orders are read-only for clients; they change only through the `set_order_status` function.
- **Tooling gotcha:** the Supabase MCP holds `DROP` and `DELETE` statements for user confirmation. When no one approves, the call just times out after 60 s, which looked like a database hang. Prefer `ALTER`/`GRANT`/`REVOKE`, or approve the prompt.
- Not tested yet: a member deleting another tenant's rows (a `DELETE` statement is held for confirmation).
- The deployed `assistant-chat` function could not be called from this environment (no outbound access to Supabase). Its logic is covered by `pipeline.test.ts` against a fake database, and the SQL by rolled-back test blocks, but the first real call from the dashboard is still the live check.
- `place_order` has two overloads (9 and 10 arguments); the 9-argument one is a thin wrapper kept because `DROP` is held by the tooling. Always call the 10-argument form.
- Test chats are stored as conversations on a `playground` channel; the dashboard hides them from Chats. The delivery wilaya must match a configured fee row (case-insensitive); when it doesn't, the assistant is shown the list of served wilayas and retries.
- The dashboard has never talked to the real Supabase project from a browser (this environment can't reach it). First real sign-up, store creation and RLS behavior still need a live check.
- Dashboard Arabic and French text is a machine-written draft; have a native speaker review it.
- The Supabase project is on a plan that pauses after inactivity if it is the free plan; use Pro ($25/month) for production.
- If the model provider fails for both providers the customer gets no reply. Needs an owner alert (planned with the Telegram work).
- Chargily Pay fees were not found; 3% is a placeholder.
- Cloudflare/Supabase/Meta limits come from third-party summaries; confirm on the official pages.

## Reference

- Supabase project ref: `xewaswcuccpankghkmhz` (region eu-west-3, org "Store Assistant DZ"; moved from `xxfakkaofpkvcicjyuis` on 2026-10-08). Functions: `/functions/v1/assistant-chat` (dashboard test chat and dev), `/functions/v1/playground-chat` (stub, 410), webhook: `/functions/v1/meta-webhook`.
- Demo store id: `a9e0bc1a-952e-4dd5-a0b1-0b91c432eb18`.
- Run the eval: `PLAYGROUND_URL=... PLAYGROUND_SECRET=... STORE_ID=... npm run eval`.
