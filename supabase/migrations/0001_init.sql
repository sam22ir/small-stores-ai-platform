-- Small Stores AI Platform: initial multi-tenant schema

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- Tenancy ---------------------------------------------------------------

create table stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency char(3) not null default 'USD',
  timezone text not null default 'UTC',
  business_info text,                 -- hours, shipping, returns; fed to the agent
  agent_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table store_members (
  store_id uuid not null references stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

create function is_store_member(p_store_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from store_members
    where store_id = p_store_id and user_id = auth.uid()
  );
$$;

-- Channels (connected Facebook Pages / Instagram accounts) ---------------

create table channels (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  platform text not null check (platform in ('facebook', 'instagram')),
  external_id text not null,          -- Page ID or Instagram account ID from Meta
  display_name text,
  status text not null default 'active' check (status in ('active', 'disconnected')),
  created_at timestamptz not null default now(),
  unique (platform, external_id)
);
create index on channels (store_id);

-- Service-role only: no RLS policies are defined, so clients cannot read tokens.
create table channel_credentials (
  channel_id uuid primary key references channels(id) on delete cascade,
  access_token_encrypted text not null,
  token_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Catalog & stock ----------------------------------------------------------

create table products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  name text not null,
  description text,
  price_cents integer not null check (price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on products (store_id);
create index products_name_trgm on products using gin (name gin_trgm_ops);

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  sku text,
  label text not null default 'Default',   -- e.g. "Size M / Black"
  price_cents integer check (price_cents >= 0),  -- null = use product price
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  updated_at timestamptz not null default now(),
  unique (store_id, sku)
);
create index on product_variants (product_id);

-- Conversations -------------------------------------------------------------

create table customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  channel_id uuid not null references channels(id) on delete cascade,
  platform_user_id text not null,     -- PSID / IGSID, scoped to the channel
  display_name text,
  created_at timestamptz not null default now(),
  unique (channel_id, platform_user_id)
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  channel_id uuid not null references channels(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  status text not null default 'bot' check (status in ('bot', 'human', 'closed')),
  handoff_reason text,
  last_customer_message_at timestamptz,   -- Meta 24h messaging window
  created_at timestamptz not null default now(),
  unique (channel_id, customer_id)
);
create index on conversations (store_id, status);

create table messages (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  channel_id uuid not null references channels(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender text not null check (sender in ('customer', 'agent', 'owner')),
  body text,
  platform_message_id text,           -- Meta message id, for webhook dedupe
  processed_at timestamptz,           -- set once the agent has handled an inbound message
  created_at timestamptz not null default now(),
  unique (channel_id, platform_message_id)
);
create index on messages (conversation_id, created_at);

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  trigger_message_id uuid references messages(id) on delete set null,
  model text not null,
  tool_calls jsonb not null default '[]',
  input_tokens integer,
  output_tokens integer,
  error text,
  created_at timestamptz not null default now()
);
create index on agent_runs (conversation_id, created_at);

-- Row level security --------------------------------------------------------

alter table stores               enable row level security;
alter table store_members        enable row level security;
alter table channels             enable row level security;
alter table channel_credentials  enable row level security;  -- no policies: service role only
alter table products             enable row level security;
alter table product_variants     enable row level security;
alter table customers            enable row level security;
alter table conversations        enable row level security;
alter table messages             enable row level security;
alter table agent_runs           enable row level security;

create policy stores_member on stores
  for all using (is_store_member(id)) with check (is_store_member(id));

create policy members_self on store_members
  for select using (user_id = auth.uid());

-- Tenant-scoped tables share one policy shape.
do $$
declare t text;
begin
  foreach t in array array[
    'channels', 'products', 'product_variants',
    'customers', 'conversations', 'messages', 'agent_runs'
  ] loop
    execute format(
      'create policy %I on %I for all using (is_store_member(store_id)) with check (is_store_member(store_id))',
      t || '_member', t
    );
  end loop;
end $$;
