# CLAUDE.md

Guidance for Claude Code working in this repo. Facts here come from the files in the repo.

## What the product is

Wakil (repo: small-stores-ai-platform) is a B2B platform for solo store owners who sell on Instagram and
Facebook Pages. An AI agent answers customer DMs for the store. Scope (v0, from `README.md`): receive DMs,
check stock and prices, answer only from the store's own catalog, hand the conversation to the owner when
it cannot help. Taking payments and creating orders are out of scope for v0 (the README's scope list).
Telegram is used for owner alerts and linking (`supabase/functions/_shared/telegram.ts`).

## Repo layout

- `supabase/functions/` Edge Functions (Deno): `assistant-chat`, `deliver-messages`, `delivery-carrier`, `instagram-connect`,
  `meta-webhook`, `playground-chat` (410 stub), `telegram-webhook`. Each has `index.ts` and `deno.json`.
- `supabase/functions/_shared/` shared code: `pipeline/` (inbound handling, reply, usage), `agent/` (model
  providers, tools, prompt, language), `meta/` (Instagram connect, webhook, ingest, delivery, crypto),
  `telegram.ts`. Unit tests sit next to the code (`*.test.ts`).
- `supabase/migrations/` SQL migrations, numbered `NNNN_name.sql` (0001 to 0019).
- `supabase/tests/rls_isolation.test.sql` pgTAP RLS tests. `supabase/config.toml` per-function JWT settings.
  `supabase/seed.sql` demo store.
- `apps/dashboard/` React dashboard and landing page (Vite, React 19, Tailwind v4, HeroUI, React Router).
  Pages are in `src/pages/`, shared code in `src/lib/`, locales in `src/lib/locales/{app,landing}/{ar,fr,en}.ts`.
- `scripts/eval-agent.mjs` scores the configured model against the demo store (`npm run eval`).
- `docs/` project docs. `docs/api.md` documents the Edge Function HTTP API. `docs/deploy.md` covers deployment.
- `.github/workflows/` `ci.yml` (lint, typecheck, tests, dashboard build and browser checks),
  `db-tests.yml` (pgTAP), `deploy.yml` (deploys).

## Commands

Root `package.json` (agent and Edge Function tooling):

- `npm ci`
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:coverage`
- `npm run eval` (needs `PLAYGROUND_URL`, `PLAYGROUND_SECRET`, `STORE_ID`)

Dashboard (`apps/dashboard/package.json`, run from that directory):

- `npm run dev`, `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run build`, `npm run test:ui`
- `npm run build` runs `tsc --noEmit` then `vite build`.

Database: `supabase test db` runs the pgTAP RLS tests (used in `db-tests.yml`). Local stack: `supabase start`.

## Conventions observed in the code

- Edge Functions import with Deno-style specifiers and explicit `.ts` extensions (for example
  `../_shared/pipeline.ts`). Packages come from `deno.json` import maps (`npm:` or `jsr:`).
- Every Edge Function checks auth itself and runs with `verify_jwt = false` in `supabase/config.toml`.
  Auth is a JWT plus store membership, an HMAC signature (Meta webhook) or a secret header (Telegram,
  `x-playground-secret`). See `docs/api.md`.
- Constant-time comparison for secrets (SHA-256 digests compared bytewise).
- UI strings are translated in `ar`, `fr` and `en` (`apps/dashboard/src/lib/locales/`).
- The UI uses HeroUI and Tailwind v4 (`apps/dashboard/package.json`).
- Every table created in the migrations has RLS enabled (16 tables, checked with `grep` over
  `supabase/migrations/`). RLS policies decide which rows a store member can see.
- Server-only tables have no policies. Example: `channel_credentials` (`0001_init.sql`, commented
  "no policies: service role only"). Edge Functions use the service role key for these.
- Privileges are granted per column where needed, for example `grant update (name, currency, timezone,
  business_info, agent_enabled) on stores to authenticated` in `0008_privileges_and_create_store.sql`.
- Migrations are numbered `NNNN_name.sql` (4 digits, underscore, snake_case name).

## Deploy

See `docs/deploy.md`. Pushing to `claude/relaxed-euler-pi9ekq` triggers `.github/workflows/deploy.yml`, which
runs `supabase db push` plus `supabase functions deploy` for each function, and builds and deploys the
dashboard to Cloudflare Pages (`store-assistant-dz`). The workflow skips a job when its secrets are missing.

## Rules

- Never commit secrets. Keep values in `.env` (git-ignored) or GitHub secrets. Public values go in
  GitHub variables (`VITE_*`). The service role key must never reach the dashboard.
- A new Edge Function must be added to `supabase/config.toml` (with its `verify_jwt` setting) and to the
  function loop in `.github/workflows/deploy.yml`.
- Each Edge Function that needs auth must check it itself, because the gateway JWT check is off.
  Read `docs/security-audit.md` before changing that.
