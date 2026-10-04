-- Fixes from the Supabase advisors (security + performance). Non-destructive only.

-- Trigger function: pin the search_path (it only uses now()).
alter function public.touch_updated_at() set search_path = '';

-- RLS helpers for new tables live in a private schema so they are not exposed as RPCs.
-- (Older tables still use public.is_store_member; that one is also needed by RLS.)
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.is_store_member(p_store_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.store_members
    where store_id = p_store_id and user_id = (select auth.uid())
  );
$$;
create or replace function private.is_store_owner(p_store_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.store_members
    where store_id = p_store_id and user_id = (select auth.uid()) and role = 'owner'
  );
$$;
revoke execute on function private.is_store_member(uuid) from public, anon;
revoke execute on function private.is_store_owner(uuid) from public, anon;
grant execute on function private.is_store_member(uuid) to authenticated;
grant execute on function private.is_store_owner(uuid) to authenticated;

-- Indexes on foreign keys (join/cascade performance).
create index if not exists agent_runs_conversation_store_idx on public.agent_runs (conversation_id, store_id);
create index if not exists agent_runs_store_id_idx on public.agent_runs (store_id, created_at desc);
create index if not exists agent_runs_trigger_message_id_idx on public.agent_runs (trigger_message_id);
create index if not exists conversations_channel_store_idx on public.conversations (channel_id, store_id);
create index if not exists conversations_customer_store_idx on public.conversations (customer_id, store_id);
create index if not exists customers_channel_store_idx on public.customers (channel_id, store_id);
create index if not exists customers_store_id_idx on public.customers (store_id);
create index if not exists messages_channel_store_idx on public.messages (channel_id, store_id);
create index if not exists messages_conversation_store_idx on public.messages (conversation_id, store_id, created_at);
create index if not exists messages_store_id_idx on public.messages (store_id);
create index if not exists variants_product_store_idx on public.product_variants (product_id, store_id);
create index if not exists store_members_user_id_idx on public.store_members (user_id);

-- Evaluate auth.uid() once per statement instead of once per row.
alter policy members_self on public.store_members using (user_id = (select auth.uid()));
