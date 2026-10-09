# Small Stores AI Platform

A B2B platform that gives solo store owners selling on **Instagram** and **Facebook Pages**
an AI agent that answers customer DMs for them.

## Scope (v0)

The agent can, for a connected store:

- receive customer DMs from Instagram and Facebook Page inbox
- check product stock (by product / variant) and prices
- answer customers using only the store's own catalog data
- hand the conversation to the owner when it cannot help

Out of scope for v0: taking payments, creating orders, comment replies, other channels.

## Web site (landing + dashboard)

The landing page and the dashboard are one React app in `apps/dashboard` (Vite, React, Tailwind v4, HeroUI). It deploys as one Cloudflare Pages site, `store-assistant-dz`:

```bash
cd apps/dashboard && npm run build && npx wrangler@4.30.0 pages deploy dist --project-name store-assistant-dz --branch main
```

The landing is served at `/` (Arabic), `/fr` and `/en`. Every other path is handled by the same single-page app: `apps/dashboard/public/_redirects` rewrites all paths to `index.html`.

## Docs

- [Project plan and decisions](docs/project-plan.md)
- [Economics](docs/economics.md)
- [Competitors](docs/competitors.md)
- [Architecture](docs/architecture.md)
- [Connecting Instagram](docs/instagram-setup.md)
- [Data model](supabase/migrations/0001_init.sql)

## Stack

TypeScript · Supabase (Postgres, Auth, RLS) · Meta Graph API webhooks · Claude (tool use)

## Testing the agent (no Meta needed)

The `assistant-chat` Edge Function runs the full pipeline (store, conversation, greeting fast path, agent, stored reply)
without Meta. Owners use it from the dashboard's **Assistant** page ("Try your assistant", signed in with their account);
scripts use it with the dev secret. `supabase/seed.sql` creates a demo store with a small catalog.

```sh
curl -X POST https://<project-ref>.supabase.co/functions/v1/assistant-chat \
  -H "x-playground-secret: $PLAYGROUND_SECRET" \
  -d '{"store_id":"<demo store id>","text":"Do you have the black hoodie in M?"}'
```

Other actions: `{"store_id": "...", "action": "reset"}` hands the test conversation back to the bot after a handoff;
`{"store_id": "...", "action": "usage"}` returns this month's reply count and limit.
Test and dev runs never create real orders or touch stock, don't count towards the monthly limit and are capped at 60
per hour per store. (`playground-chat` is now a stub that answers 410.)
Needs the `PLAYGROUND_SECRET` secret plus a model provider (below).

To test with a free OpenAI-compatible model instead (for example on TokenRouter), set the secrets
`LLM_PROVIDER=openai-compatible`, `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL`. Remove `LLM_PROVIDER` to go back to Claude.
Results on other models don't show how the Claude agent behaves, so use fake data and treat it as a flow test only.

**Primary + fallback.** Set `LLM_FALLBACK_BASE_URL`, `LLM_FALLBACK_API_KEY` and `LLM_FALLBACK_MODEL` (plus optional
`LLM_FALLBACK_TOKEN_PARAM` / `_REASONING_EFFORT` / `_TEMPERATURE`) and the function tries the primary first, with a 20 s
timeout and no retry. If it errors, times out or is rate-limited, the same message is answered by the fallback. After 3
consecutive primary failures the primary is skipped for 60 s, so customers don't wait on a dead endpoint. Each reply
reports `provider` and `fell_back`, and `agent_runs` records the provider and why the primary was skipped.

Unit tests (fake model client, catalog and database, no network): `npm install && npm test`.

To score whichever model the function is currently configured with (12 scenarios: catalog use, hidden stock counts,
handoff, injection, Arabic, Darija in Latin letters, French, free greeting/thanks replies, store info), run against the
seeded demo store. `EVAL_ORDERS=1` adds the multi-turn order flow (turn on "Take orders" for that store first):

```sh
PLAYGROUND_URL=https://<project-ref>.supabase.co/functions/v1/assistant-chat \
PLAYGROUND_SECRET=... STORE_ID=<demo store id> npm run eval
```

## Setup

```sh
cp .env.example .env   # fill in values
```
