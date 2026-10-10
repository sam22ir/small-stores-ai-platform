-- Per-store monthly token cap for the AI agent, and a once-a-month owner alert marker.
-- Additive. Usage is already recorded per run in agent_runs (input_tokens, output_tokens).

-- Tokens (input + output) the agent may use per calendar month (UTC). NULL = unlimited.
-- Members can read it (stores select is already granted and RLS-scoped). They cannot change it:
-- the authenticated role only has column-level UPDATE grants on stores, and this column is not one.
-- Only the service role (admin tooling) sets it.
alter table stores add column if not exists ai_monthly_token_limit integer
  default 10000000
  check (ai_monthly_token_limit is null or ai_monthly_token_limit >= 0);

-- One row per store and month, written when the cap alert is sent, so the owner hears about it once.
-- Server-only, like store_telegram: RLS on, no policies, no grants to clients.
create table if not exists store_ai_cap_alerts (
  store_id uuid not null references stores(id) on delete cascade,
  month date not null,
  created_at timestamptz not null default now(),
  primary key (store_id, month)
);

alter table store_ai_cap_alerts enable row level security;
revoke all on store_ai_cap_alerts from anon, authenticated;
