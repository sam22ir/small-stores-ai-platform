# Small Stores AI Platform

A B2B platform that gives solo store owners selling on **Instagram** an AI agent that answers
customer DMs for them. Facebook Messenger is coming soon.

## Scope (v0)

The agent can, for a connected store:

- receive customer DMs from the Instagram inbox
- check product stock (by product / variant) and prices
- answer customers using only the store's own catalog data
- take cash-on-delivery orders in chats, if the owner turns on order taking (off by default per store)
- hand the conversation to the owner when it cannot help

Out of scope for v0: online payments from customers, comment replies, Facebook Messenger and other channels.

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
- [Deploying (CI workflow, secrets, manual deploy)](docs/deploy.md)
- [Data model](supabase/migrations/0001_init.sql)
- [Edge Function API](docs/api.md)
- [Guidance for Claude Code (CLAUDE.md)](CLAUDE.md)

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
Needs the `PLAYGROUND_SECRET` secret, `PLAYGROUND_STORE_IDS` (comma-separated ids of the stores the dev secret may
use, for example the demo store; any other store answers 403), plus a model provider (below).

To test with a free OpenAI-compatible model instead (for example on TokenRouter), set the secrets
`LLM_PROVIDER=openai-compatible`, `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL`. Remove `LLM_PROVIDER` to go back to Claude.
Results on other models don't show how the Claude agent behaves, so use fake data and treat it as a flow test only.

**Primary + fallback.** Set `LLM_FALLBACK_BASE_URL`, `LLM_FALLBACK_API_KEY` and `LLM_FALLBACK_MODEL` (plus optional
`LLM_FALLBACK_TOKEN_PARAM` / `_REASONING_EFFORT` / `_TEMPERATURE`) and the function tries the primary first, with a 20 s
timeout and no retry. If it errors, times out or is rate-limited, the same message is answered by the fallback. After 3
consecutive primary failures the primary is skipped for 60 s, so customers don't wait on a dead endpoint. Each reply
reports `provider` and `fell_back`, and `agent_runs` records the provider and why the primary was skipped.

Unit tests (fake model client, catalog and database, no network): `npm install && npm test`.

To score whichever model the function is currently configured with (36 scenarios: catalog use, hidden stock counts,
handoff and human requests, out-of-stock and unknown-policy answers, prompt injection, language and script, Darija in Latin
letters, French, emoji- and markdown-free replies, free greeting/thanks replies, store info), run against the seeded demo
store. `EVAL_ORDERS=1` adds the multi-turn order flow (turn on "Take orders" for that store first).

**This makes real model calls and costs tokens.** Each case is one message through the configured model, and the
function allows 60 test messages per store per hour, so a full run uses most of that allowance. Run it only against a
dedicated eval store, never a real customer store:

1. Apply `supabase/seed.sql` to the project that `PLAYGROUND_URL` points at. Locally, `supabase db reset` applies it; on a
   hosted project, run the file in the SQL editor. Use a project that holds no customer stores. The seed creates its own
   "Demo Boutique" store, separate from customer stores, and does nothing if one with that name already exists.
2. Find its id: `select id from stores where name = 'Demo Boutique';`. Put only that id in `PLAYGROUND_STORE_IDS`
   on the function, and use it as `STORE_ID`. Never set either to a customer store. Test messages are written as
   conversations, messages and `agent_runs` rows in that store.
3. Run:

```sh
PLAYGROUND_URL=https://<project-ref>.supabase.co/functions/v1/assistant-chat \
PLAYGROUND_SECRET=... STORE_ID=<eval store id> npm run eval
```

Options: `EVAL_ONLY=substr1,substr2` runs only the cases whose name contains one of the substrings (case-insensitive;
it exits 2 if nothing matches). The run ends with `N/M checks passed` and exits 1 if any check fails. A 429 means the
hourly cap was reached: wait an hour, or run fewer cases. The checks are mechanical (tool calls, handoff flag, banned
patterns), so read the printed replies too.

## Stress test (local, no database)

`scripts/stress-agent.mjs` (`npm run stress`) runs scripted customer conversations through the real inbound pipeline
(`handleInbound`) against an in-memory database built fresh for each case from a store fixture. The database enforces
the production order rules (phone format, wilaya, variant ownership, stock, quantity limits, totals) through the same
ports and error codes. Owner alerts are captured, not sent, and the only network call allowed is the model.

```sh
# Self-test with the built-in deterministic model (no network, no key):
npm run stress -- --stub --cases scripts/stress/sample-cases.json --fixture scripts/stress/fixture.json --out /tmp/stress.jsonl

# Real model: the same LLM_* variables as the function (LLM_PROVIDER=openai-compatible, LLM_BASE_URL, LLM_API_KEY,
# LLM_MODEL, optional LLM_TOKEN_PARAM, LLM_REASONING_EFFORT, LLM_VISION). Check them first:
npm run stress -- --probe
npm run stress -- --cases 'path/cases-*.json' --fixture <fixture.json> --out results.jsonl --concurrency 3 --resume
```

`--cases` takes a directory (it loads its `cases-*.json` files), one file, or a quoted glob. `--ids`, `--limit` and
`--resume` select cases. Each finished case appends one JSON line (SPEC "Result record" shape, plus `photos` per turn).
Model failures that are not the bot's fault (429, 5xx, timeouts, network) are retried up to four times with backoff and
then recorded with `infra_error`; a rejected request (for example a 401) is recorded with `infra_error` at once. With
`--resume`, a case is skipped only when it has a clean record; the last record for an id wins. The runner prints no
headers or environment values. `npm test` covers the fake order rules.

## Setup

```sh
cp .env.example .env   # fill in values
```
