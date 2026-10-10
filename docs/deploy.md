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
