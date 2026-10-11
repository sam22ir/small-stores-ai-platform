-- Subscription billing (1,000 DA per store per month, paid through Chargily Pay).
-- Additive. Only the service role (edge functions) writes these columns and rows.

-- Plan state on the store. trial_ends_at defaults to 14 days after the row is created.
-- paid_until is the end of the last paid period (null until the first payment).
alter table stores add column if not exists plan_status text not null default 'trial'
  check (plan_status in ('trial', 'active', 'past_due'));
alter table stores add column if not exists trial_ends_at timestamptz not null default (now() + interval '14 days');
alter table stores add column if not exists paid_until timestamptz;
-- The expiry boundary the owner was last alerted about, so the Telegram alert is sent once per lapse.
alter table stores add column if not exists billing_alerted_for timestamptz;

-- Members may read the stores columns (table-level select is already granted), but none of the
-- billing columns are in the column-level UPDATE grant, so clients cannot change them.

-- One row per Chargily checkout. checkout_id is unique: a redelivered webhook cannot pay twice.
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  checkout_id text not null unique,
  amount integer not null check (amount > 0),
  currency text not null default 'dzd',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_store_created_idx on payments (store_id, created_at desc);

alter table payments enable row level security;
revoke all on payments from anon, authenticated;
grant select on payments to authenticated;

-- Store members can read their own store's payment history. No write policies: only the service role writes.
create policy payments_member_read on payments
  for select to authenticated
  using (is_store_member(store_id));
