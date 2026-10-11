# Deploying

`.github/workflows/deploy.yml` deploys on every push to `claude/relaxed-euler-pi9ekq` (and on demand via **Actions > Deploy > Run workflow**). It runs two independent jobs:

- **supabase**: `supabase db push` (migrations), then `supabase functions deploy` for every Edge Function. `verify_jwt` for each function comes from `supabase/config.toml`.
- **dashboard**: `npm ci && npm run build` in `apps/dashboard`, then `wrangler@4.30.0 pages deploy dist` to the Cloudflare Pages project `store-assistant-dz` (branch `main`).

A `check-secrets` job runs first. If a job's required secrets or vars are missing, that job is skipped with a log line, so the workflow stays green until you configure them.

## Required GitHub configuration

Set these under **Settings > Secrets and variables > Actions**.

Secrets:

| Name | Used by | Notes |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | supabase | Personal access token for the Supabase CLI. |
| `SUPABASE_PROJECT_REF` | supabase | Project reference ID (the subdomain part of the project URL). |
| `SUPABASE_DB_PASSWORD` | supabase | Database password, needed by `link` and `db push`. |
| `CLOUDFLARE_API_TOKEN` | dashboard | API token with Cloudflare Pages edit permission. |
| `CLOUDFLARE_ACCOUNT_ID` | dashboard | Cloudflare account ID. |

Variables (public values, read at build time, so they are not secrets):

| Name | Required | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | yes, for dashboard | Supabase project URL. |
| `VITE_SUPABASE_ANON_KEY` | yes, for dashboard | Publishable (anon) key. Never the service-role key. |
| `VITE_TELEGRAM_BOT_USERNAME` | no | Leave unset to hide the Telegram card. |
| `VITE_LANDING_URL` | no | Optional landing URL override. |

Never put the service-role key or any `sb_secret_` / Cloudflare token in a variable or in the repo.

## Subscription billing (Chargily Pay)

Stores pay 1,000 DA per month. Two Edge Functions handle it: `billing-checkout` (owner starts a payment, returns the Chargily checkout URL) and `chargily-webhook` (Chargily's `checkout.paid` extends `stores.paid_until` by 30 days). Both are deployed with `verify_jwt = false` and check auth themselves.

Edge Function secrets (set with `supabase secrets set`, never in the repo):

| Name | Notes |
| --- | --- |
| `CHARGILY_SECRET_KEY` | Chargily Pay secret key. Test key while testing. It also verifies webhook signatures. |
| `CHARGILY_API_BASE` | `https://pay.chargily.net/test/api/v2` for test, `https://pay.chargily.net/api/v2` for live. |
| `BILLING_ENFORCED` | `true` turns on the subscription gate (expired trial or unpaid stores are handed to the owner). Leave unset until a live Chargily payment has been tested. Before turning it on, check `stores.trial_ends_at` for existing stores: it was set to 14 days after migration 0022 ran. |
| `DASHBOARD_URL` | Already used by Instagram. Checkout returns to `<DASHBOARD_URL>/settings`. |

Register the webhook endpoint `<SUPABASE_URL>/functions/v1/chargily-webhook` (it is also sent per checkout as `webhook_endpoint`).

Migration `0020_billing.sql` adds `stores.plan_status`, `trial_ends_at` (14 days), `paid_until`, and the `payments` table. Existing stores start a 14-day trial when it is applied. Once the trial and the paid period (plus a 3-day grace) have ended, the assistant hands customer chats to the owner without calling the model, and the owner gets one Telegram alert per lapse.

Going live: check the checkout fields and webhook signature once against a real test payment (see the notes in `supabase/functions/_shared/billing.ts`).

## Local run

```bash
npm ci                      # agent/edge-function tooling at the repo root
npm run typecheck
npm test

cd apps/dashboard
cp .env.example .env.local  # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm ci
npm run dev                 # http://localhost:5173
```

Edge Functions locally: `supabase start`, then `supabase functions serve`.

## Manual deploy

Deploy the dashboard from your machine (requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in your shell, never committed):

```bash
cd apps/dashboard && npm run build && npx wrangler@4.30.0 pages deploy dist --project-name store-assistant-dz --branch main
```

Deploy the backend manually:

```bash
supabase link --project-ref "$SUPABASE_PROJECT_REF"   # prompts for the DB password if not set
supabase db push
supabase functions deploy assistant-chat
# repeat for each function in supabase/functions (except _shared)
```

Prefer the workflow for routine releases so each deploy is logged and serialized.

## Chargily Pay secrets

Run `scripts/set-chargily-secrets.sh` in your own terminal (after `supabase login`). It asks for the Chargily secret key with hidden input, picks the test or live API URL from the key prefix (`test_sk_` / `live_sk_`), asks for the dashboard URL, and sets `CHARGILY_SECRET_KEY`, `CHARGILY_API_BASE` and `DASHBOARD_URL` on the Supabase project. Run it again to switch from a test key to a live key. Cutting off unpaid stores stays off until `BILLING_ENFORCED` is set.
