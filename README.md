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

## Docs

- [Architecture](docs/architecture.md)
- [Data model](supabase/migrations/0001_init.sql)

## Stack

TypeScript · Supabase (Postgres, Auth, RLS) · Meta Graph API webhooks · Claude (tool use)

## Testing the agent (no Meta needed)

The `playground-chat` Edge Function runs the full pipeline (store, conversation, agent, stored reply) without Meta.
`supabase/seed.sql` creates a demo store with a small catalog.

```sh
curl -X POST https://<project-ref>.supabase.co/functions/v1/playground-chat \
  -H "x-playground-secret: $PLAYGROUND_SECRET" \
  -d '{"store_id":"<demo store id>","text":"Do you have the black hoodie in M?"}'
```

Send `{"store_id": "...", "reset": true}` to hand a conversation back to the bot after a handoff.
Needs the `ANTHROPIC_API_KEY` and `PLAYGROUND_SECRET` Edge Function secrets.

To test with a free OpenAI-compatible model instead (for example on TokenRouter), set the secrets
`LLM_PROVIDER=openai-compatible`, `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL`. Remove `LLM_PROVIDER` to go back to Claude.
Results on other models don't show how the Claude agent behaves, so use fake data and treat it as a flow test only.

**Primary + fallback.** Set `LLM_FALLBACK_BASE_URL`, `LLM_FALLBACK_API_KEY` and `LLM_FALLBACK_MODEL` (plus optional
`LLM_FALLBACK_TOKEN_PARAM` / `_REASONING_EFFORT` / `_TEMPERATURE`) and the function tries the primary first, with a 20 s
timeout and no retry. If it errors, times out or is rate-limited, the same message is answered by the fallback. After 3
consecutive primary failures the primary is skipped for 60 s, so customers don't wait on a dead endpoint. Each reply
reports `provider` and `fell_back`, and `agent_runs` records the provider and why the primary was skipped.

Agent unit tests (fake Claude client and catalog, no network): `npm install && npm test`.

To score whichever model the function is currently configured with (8 scenarios: catalog use, hidden stock counts,
handoff, injection, Arabic, store info), run against the seeded demo store:

```sh
PLAYGROUND_URL=https://<project-ref>.supabase.co/functions/v1/playground-chat \
PLAYGROUND_SECRET=... STORE_ID=<demo store id> npm run eval
```

## Setup

```sh
cp .env.example .env   # fill in values
```
