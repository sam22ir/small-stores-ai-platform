-- Least-privilege policies, store creation RPC and updated_at triggers.
create function is_store_owner(p_store_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from store_members
    where store_id = p_store_id and user_id = auth.uid() and role = 'owner'
  );
$$;
revoke execute on function is_store_owner(uuid) from public, anon;
grant execute on function is_store_owner(uuid) to authenticated;

-- Stores: members read, owners update. Creation goes through create_store(); no client delete.
drop policy stores_member on stores;
create policy stores_select on stores for select using (is_store_member(id));
create policy stores_update on stores for update
  using (is_store_owner(id)) with check (is_store_owner(id));

-- Channels are created only by the server after Meta proves Page ownership. A client-writable
-- channels table would let anyone claim another store's Page ID and receive its customers' DMs.
drop policy channels_member on channels;
create policy channels_select on channels for select using (is_store_member(store_id));

-- Customers, agent runs: read-only for clients (written by the server).
drop policy customers_member on customers;
create policy customers_select on customers for select using (is_store_member(store_id));
drop policy agent_runs_member on agent_runs;
create policy agent_runs_select on agent_runs for select using (is_store_member(store_id));

-- Conversations: members read and update (hand back to bot, close); the server creates them.
drop policy conversations_member on conversations;
create policy conversations_select on conversations for select using (is_store_member(store_id));
create policy conversations_update on conversations for update
  using (is_store_member(store_id)) with check (is_store_member(store_id));

-- Messages: members read and may add owner replies, nothing else.
drop policy messages_member on messages;
create policy messages_select on messages for select using (is_store_member(store_id));
create policy messages_owner_reply on messages for insert
  with check (
    is_store_member(store_id)
    and direction = 'outbound' and sender = 'owner'
    and delivery_status = 'pending'
  );

-- Store creation: inserts the store and the caller's owner membership atomically.
create function create_store(p_name text, p_currency text default 'USD') returns uuid
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
  if upper(p_currency) !~ '^[A-Z]{3}$' then
    raise exception 'currency must be a 3-letter code';
  end if;

  insert into stores (name, currency) values (trim(p_name), upper(p_currency))
  returning id into s;
  insert into store_members (store_id, user_id, role) values (s, auth.uid(), 'owner');
  return s;
end $$;
revoke execute on function create_store(text, text) from public, anon;
grant execute on function create_store(text, text) to authenticated;

-- Keep products.updated_at honest.
create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger products_touch before update on products
  for each row execute function touch_updated_at();
create trigger variants_touch before update on product_variants
  for each row execute function touch_updated_at();
