# Project plan and decisions

Last updated: 2026-10-04. Items marked **(decision)** were agreed in conversation; **(open)** are not settled.

## Product

- **What:** an AI agent that answers customers' DMs for small, often solo, stores that sell on **Instagram and Facebook Pages**. Target market first: **Algeria** (Darija, French, Arabic, cash on delivery).
- **v0 scope (decision):** check store stock and prices, answer from the store's own catalog and info, hand the conversation to the owner when it can't help. No orders or payments yet.
- **Meta (Instagram/Facebook) connection comes last (decision).** Until then everything is tested through the `playground-chat` function.

## Architecture (decision)

- TypeScript. Supabase (Postgres, Auth, RLS, Edge Functions) for data and the agent. See [architecture.md](architecture.md).
- Dashboard: static web app hosted on **Cloudflare** (free plan), talking straight to Supabase. Cloudflare **R2** later for customers' voice notes and images.
- Agent code lives in `supabase/functions/_shared/agent/`; unit tests run with `npm test` (no network).
- Multi-tenant: one store per tenant, RLS on every table, composite `(id, store_id)` foreign keys so rows can't cross tenants.

## Model providers (decision)

- The agent talks to any **OpenAI-compatible** endpoint (`chat_completions.ts`) and can chain providers (`providers.ts`):
  1. **Primary: the friend's endpoint**, `https://codex-everywhere.com/v1`, model `gpt-6-luna`.
  2. **Fallback: official OpenAI**, `https://api.openai.com/v1`, model `gpt-6-luna`.
- Fallback rule: the primary gets one 20 s attempt; on any error the same message goes to the fallback. After 3 consecutive primary failures the primary is skipped for 60 s.
- GPT-6 Luna on Chat Completions only supports function calling with `reasoning_effort = none`, and wants `max_completion_tokens`. Both are configurable per provider.
- Secrets (Supabase Edge Function secrets, never in the repo): `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_TOKEN_PARAM`, `LLM_REASONING_EFFORT`, and the same with `LLM_FALLBACK_` for the fallback. `PLAYGROUND_SECRET` protects the dev endpoint. See `.env.example`.
- A **Claude (Anthropic) path** exists (default model `claude-sonnet-5-5`) but is not the plan. Kept as an option and a quality comparison.
- Free models (TokenRouter, OpenRouter) were used **only to test the pipeline**. Their results say nothing about the final model.
- **(open) Risk accepted by the owner:** the friend's endpoint is primary, so it sees every customer message. Get its terms in writing, keep prepaid credit small, and treat the fallback as protection for uptime only, not privacy.

## Pricing and economics

Full numbers in [economics.md](economics.md). Summary:

- **(decision, owner's number)** Charge about **1,000 DA per store per month** (about $3.86 at 256-260 DA per dollar).
- Money flow: the owner buys dollars at ~256 DA ($10 for 2,560 DA) and loads them as credit on the friend's platform.
- At realistic volumes the AI cost is tiny; risk is concentrated in very busy stores, so **usage tracking and a cap or top-up packs are needed** **(open)**.
- Competitor Chatbot DZ sells prepaid "tokens" with no subscription; see [competitors.md](competitors.md).

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
- Provider chain with fallback, repeatable eval script (`npm run eval`), 41 unit tests.

Next, in this order (open):
1. Fix the database security policies (migration `0005`, see below).
2. Telegram handoff alert.
3. Dashboard as a static web app on Cloudflare (login, catalog and stock, inbox).
4. Darija / French / Arabic-in-Latin-letters scenarios in the eval script.
5. Usage counting per store, caps or credits, pricing in DA via Chargily Pay.
6. Rule-based fast path for simple messages (saves model cost); voice notes and images.
7. Meta connection and App Review (last).

## Known issues

- **Policy migration `0005` is not applied.** Policy statements on `stores` hang through the Supabase MCP (cause unknown; other DDL works). The database still has the older, looser policies, notably a client-writable `channels` table. Harmless with nothing connected, **must be fixed before the Meta step.** The `is_store_owner` function from that migration already exists.
- The Supabase project is on a plan that pauses after inactivity if it is the free plan; use Pro ($25/month) for production.
- If the model provider fails for both providers the customer gets no reply. Needs an owner alert (planned with the Telegram work).
- Chargily Pay fees were not found; 3% is a placeholder.
- Cloudflare/Supabase/Meta limits come from third-party summaries; confirm on the official pages.

## Reference

- Supabase project ref: `xxfakkaofpkvcicjyuis` (region eu-west-1). Function: `/functions/v1/playground-chat`, webhook: `/functions/v1/meta-webhook`.
- Demo store id: `2d25ccab-ffc6-4452-937b-6f4c40667de3`.
- Run the eval: `PLAYGROUND_URL=... PLAYGROUND_SECRET=... STORE_ID=... npm run eval`.
