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
- **Owner dashboard v1** (`apps/dashboard`): sign-in, store setup, chats inbox with owner replies and hand-back, catalog with one-tap stock edits, settings, Arabic/French/English with RTL, installable app. Static, deploys to Cloudflare Pages. 32 browser checks against a mock backend; not yet run against the live Supabase project or deployed.

Next, in this order (open):
1. ~~Fix the database security policies~~ done with migration `0008`.
2. Telegram handoff alert.
3. ~~Dashboard as a static web app~~ v1 built; next: deploy it, try it with a real account, add a "test your assistant" chat (needs a JWT-protected function), then push notifications.
4. Darija / French / Arabic-in-Latin-letters scenarios in the eval script.
5. Usage counting per store, caps or credits, pricing in DA via Chargily Pay.
6. Rule-based fast path for simple messages (saves model cost); voice notes and images.
7. Meta connection and App Review (last).

## Known issues

- **Security is done with privileges (migration `0008`), not policy rewrites.** The old broad "for all" RLS policies remain, but clients can only do what `0008` grants: read their own rows, edit store settings, hand conversations back, add owner replies, manage the catalog. Checked with simulated users (cross-tenant reads, writes, the composite-FK trick, anonymous access). Server-only tables (`channels`, `customers`, `agent_runs`, `channel_credentials`) are not writable by clients.
- **Tooling gotcha:** the Supabase MCP holds `DROP` and `DELETE` statements for user confirmation. When no one approves, the call just times out after 60 s, which looked like a database hang. Prefer `ALTER`/`GRANT`/`REVOKE`, or approve the prompt.
- Not tested yet: a member deleting another tenant's rows (a `DELETE` statement is held for confirmation).
- The dashboard has never talked to the real Supabase project from a browser (this environment can't reach it). First real sign-up, store creation and RLS behavior still need a live check.
- Dashboard Arabic and French text is a machine-written draft; have a native speaker review it.
- The Supabase project is on a plan that pauses after inactivity if it is the free plan; use Pro ($25/month) for production.
- If the model provider fails for both providers the customer gets no reply. Needs an owner alert (planned with the Telegram work).
- Chargily Pay fees were not found; 3% is a placeholder.
- Cloudflare/Supabase/Meta limits come from third-party summaries; confirm on the official pages.

## Reference

- Supabase project ref: `xxfakkaofpkvcicjyuis` (region eu-west-1). Function: `/functions/v1/playground-chat`, webhook: `/functions/v1/meta-webhook`.
- Demo store id: `2d25ccab-ffc6-4452-937b-6f4c40667de3`.
- Run the eval: `PLAYGROUND_URL=... PLAYGROUND_SECRET=... STORE_ID=... npm run eval`.
