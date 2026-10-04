-- Least privilege for the dashboard (replaces the never-applied 0005).
-- RLS policies still decide WHICH rows a member can touch; table/column privileges decide
-- WHAT they may do. Done with GRANT/REVOKE because the Supabase MCP holds DROP/DELETE
-- statements for user confirmation, and the old "for all" policies were left in place.

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- Read everything of their own store (RLS filters rows).
grant select on stores, store_members, channels, customers, conversations, messages, agent_runs to authenticated;
-- Settings the owner may edit; never the id.
grant update (name, currency, timezone, business_info, agent_enabled) on stores to authenticated;
-- Hand a conversation back to the bot or close it.
grant update (status, handoff_reason) on conversations to authenticated;
-- Owner replies.
grant insert on messages to authenticated;
-- Catalog is fully theirs.
grant select, insert, update, delete on products, product_variants to authenticated;
-- channels (Meta ids), customers, agent_runs, channel_credentials: written by the server only.

create or replace function is_store_owner(p_store_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from store_members
    where store_id = p_store_id and user_id = auth.uid() and role = 'owner'
  );
$$;
revoke execute on function is_store_owner(uuid) from public, anon;
grant execute on function is_store_owner(uuid) to authenticated;

-- Store creation: inserts the store and the caller's owner membership atomically.
create or replace function create_store(p_name text, p_currency text default 'DZD') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 or length(p_name) > 100 then
    raise exception 'store name must be 1-100 characters';
  end if;
  if upper(coalesce(p_currency, '')) !~ '^[A-Z]{3}$' then
    raise exception 'currency must be a 3-letter code';
  end if;

  insert into stores (name, currency) values (trim(p_name), upper(p_currency))
  returning id into s;
  insert into store_members (store_id, user_id, role) values (s, auth.uid(), 'owner');
  return s;
end $$;
revoke execute on function create_store(text, text) from public, anon;
grant execute on function create_store(text, text) to authenticated;

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create or replace trigger products_touch before update on products
  for each row execute function touch_updated_at();
create or replace trigger variants_touch before update on product_variants
  for each row execute function touch_updated_at();
