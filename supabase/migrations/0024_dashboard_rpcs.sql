-- Dashboard RPCs: atomic product save, stock adjust, inbox list, store insights.
-- Plus handoff history (conversations.handed_off_at), realtime for messages and orders, and a trigram
-- index on message bodies for inbox search.
--
-- All functions are security invoker. RLS and the composite FKs already scope rows to the caller's store;
-- each function also checks auth.uid() and store membership explicitly (defense in depth). A definer
-- function would let a member of store A pass a store B id and write it.

-- 1. Handoff history -----------------------------------------------------------------------------
-- Stamped when a handoff reason is set (or changes to a new non-null value). Owner takeover changes
-- only the status, so it does not stamp. Metrics count handoffs from this date on.
alter table conversations add column if not exists handed_off_at timestamptz;

create or replace function stamp_handed_off_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.handoff_reason is not null
     and (tg_op = 'INSERT' or new.handoff_reason is distinct from old.handoff_reason) then
    new.handed_off_at := now();
  end if;
  return new;
end $$;

create or replace trigger conversations_handed_off_at
  before insert or update of handoff_reason on conversations
  for each row execute function stamp_handed_off_at();

-- 2. save_product ---------------------------------------------------------------------------------
-- Upserts a product and its variants in one call (one transaction).
--   p_product:  {name, description, aliases, price_cents, active}   (the full product state)
--   p_variants: [{id?, label, stock_quantity, price_cents?}]        (no id = new variant)
-- Variants missing from p_variants are deleted. A variant id that does not belong to this product
-- (and so not to this store) raises, and the whole call rolls back.
create or replace function save_product(
  p_store_id uuid,
  p_product_id uuid,
  p_product jsonb,
  p_variants jsonb
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := p_product_id;
  v jsonb;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not private.is_store_member(p_store_id) then
    raise exception 'not a member of this store' using errcode = '42501';
  end if;
  if jsonb_typeof(p_product) is distinct from 'object' then
    raise exception 'p_product must be an object' using errcode = '22023';
  end if;
  if jsonb_typeof(p_variants) is distinct from 'array' then
    raise exception 'p_variants must be an array' using errcode = '22023';
  end if;

  if v_id is null then
    insert into products (store_id, name, description, aliases, price_cents, active)
    values (p_store_id, p_product->>'name', p_product->>'description', p_product->>'aliases',
            (p_product->>'price_cents')::integer, coalesce((p_product->>'active')::boolean, true))
    returning id into v_id;
  else
    update products
       set name = p_product->>'name',
           description = p_product->>'description',
           aliases = p_product->>'aliases',
           price_cents = (p_product->>'price_cents')::integer,
           active = coalesce((p_product->>'active')::boolean, active),
           updated_at = now()
     where id = v_id and store_id = p_store_id;
    if not found then
      raise exception 'product not found' using errcode = 'P0002';
    end if;
  end if;

  -- Every variant id given must already belong to this product. Checked before any variant write.
  if exists (
    select 1 from jsonb_array_elements(p_variants) e
    where nullif(e->>'id', '') is not null
      and not exists (
        select 1 from product_variants pv
        where pv.id = (e->>'id')::uuid and pv.product_id = v_id and pv.store_id = p_store_id)
  ) then
    raise exception 'variant does not belong to this product' using errcode = 'P0002';
  end if;

  delete from product_variants pv
   where pv.product_id = v_id and pv.store_id = p_store_id
     and not exists (
       select 1 from jsonb_array_elements(p_variants) e
       where nullif(e->>'id', '') is not null and (e->>'id')::uuid = pv.id);

  for v in select value from jsonb_array_elements(p_variants) loop
    if nullif(v->>'id', '') is null then
      insert into product_variants (store_id, product_id, label, stock_quantity, price_cents)
      values (p_store_id, v_id, coalesce(nullif(btrim(v->>'label'), ''), 'Default'),
              coalesce((v->>'stock_quantity')::integer, 0), (v->>'price_cents')::integer);
    else
      update product_variants
         set label = coalesce(nullif(btrim(v->>'label'), ''), 'Default'),
             stock_quantity = coalesce((v->>'stock_quantity')::integer, 0),
             price_cents = (v->>'price_cents')::integer,
             updated_at = now()
       where id = (v->>'id')::uuid and product_id = v_id and store_id = p_store_id;
    end if;
  end loop;

  return v_id;
end $$;

-- 3. adjust_stock ---------------------------------------------------------------------------------
-- Relative stock change, floored at zero. Atomic (no read-modify-write in the client).
-- Raises when the variant is not visible to the caller (another store, or missing).
create or replace function adjust_stock(p_variant_id uuid, p_delta integer) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  v_store uuid;
  v_qty integer;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_delta is null then
    raise exception 'p_delta is required' using errcode = '22023';
  end if;

  select pv.store_id into v_store from product_variants pv where pv.id = p_variant_id;
  if v_store is null or not private.is_store_member(v_store) then
    raise exception 'variant not found' using errcode = 'P0002';
  end if;

  update product_variants pv
     set stock_quantity = greatest(0, pv.stock_quantity + p_delta),
         updated_at = now()
   where pv.id = p_variant_id and pv.store_id = v_store
  returning pv.stock_quantity into v_qty;
  if not found then
    raise exception 'variant not found' using errcode = 'P0002';
  end if;
  return v_qty;
end $$;

-- 4. inbox_list -----------------------------------------------------------------------------------
-- One row per conversation (playground test chats excluded), with the customer, channel and the
-- latest message. Newest customer message first; conversations without one last.
-- Search matches the customer's display name or any message body, case-insensitively (ilike).
-- %, _ and \ in the search term are literal. Paging is keyset on (last_customer_message_at, id):
-- pass the last row's values as p_before_at and p_before_id to get the next page.
create or replace function inbox_list(
  p_store_id uuid,
  p_status text,
  p_search text,
  p_limit integer default 50,
  p_before_at timestamptz default null,
  p_before_id uuid default null
) returns table (
  id uuid,
  status text,
  handoff_reason text,
  last_customer_message_at timestamptz,
  created_at timestamptz,
  customer_name text,
  platform_user_id text,
  platform text,
  last_body text,
  last_direction text,
  last_message_at timestamptz
)
language plpgsql security invoker set search_path = public as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_term text := nullif(btrim(p_search), '');
  v_pattern text;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not private.is_store_member(p_store_id) then
    raise exception 'not a member of this store' using errcode = '42501';
  end if;

  if v_term is not null then
    v_pattern := '%' || replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select c.id, c.status, c.handoff_reason, c.last_customer_message_at, c.created_at,
         cu.display_name, cu.platform_user_id, ch.platform,
         lm.body, lm.direction, lm.created_at
  from conversations c
  join channels ch on ch.id = c.channel_id
  join customers cu on cu.id = c.customer_id
  left join lateral (
    select m.body, m.direction, m.created_at
    from messages m
    where m.conversation_id = c.id
    order by m.created_at desc, m.id desc
    limit 1
  ) lm on true
  where c.store_id = p_store_id
    and ch.platform <> 'playground'
    and (p_status is null or c.status = p_status)
    and (v_pattern is null
         or cu.display_name ilike v_pattern
         or exists (
           select 1 from messages m2
           where m2.conversation_id = c.id and m2.store_id = p_store_id and m2.body ilike v_pattern))
    and (p_before_id is null
         or (p_before_at is not null and (
               c.last_customer_message_at < p_before_at
               or (c.last_customer_message_at = p_before_at and c.id < p_before_id)
               or c.last_customer_message_at is null))
         or (p_before_at is null and c.last_customer_message_at is null and c.id < p_before_id))
  order by c.last_customer_message_at desc nulls last, c.id desc
  limit v_limit;
end $$;

-- 5. store_insights -------------------------------------------------------------------------------
-- Daily series and totals for the last p_days days (1..90), by UTC date.
--   conversations: created (playground excluded); replies: customer-source agent runs;
--   handoffs: by handed_off_at; orders and revenue: created, excluding cancelled (revenue = total_cents).
-- Also: top 5 products by quantity ordered (same window, excluding cancelled), and reply_credits.
create or replace function store_insights(p_store_id uuid, p_days integer) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 7), 1), 90);
  v_today date := (now() at time zone 'UTC')::date;
  v_first date := v_today - (v_days - 1);
  v_from timestamptz := v_first::timestamp at time zone 'UTC';
  v_series jsonb;
  v_totals jsonb;
  v_top jsonb;
  v_credits integer;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not private.is_store_member(p_store_id) then
    raise exception 'not a member of this store' using errcode = '42501';
  end if;

  with series as (
    select d::date as day from generate_series(v_first::timestamp, v_today::timestamp, interval '1 day') d
  ),
  convs as (
    select (c.created_at at time zone 'UTC')::date as day, count(*) as n
    from conversations c join channels ch on ch.id = c.channel_id
    where c.store_id = p_store_id and ch.platform <> 'playground' and c.created_at >= v_from
    group by 1
  ),
  reps as (
    select (r.created_at at time zone 'UTC')::date as day, count(*) as n
    from agent_runs r
    where r.store_id = p_store_id and r.source = 'customer' and r.created_at >= v_from
    group by 1
  ),
  hands as (
    select (c.handed_off_at at time zone 'UTC')::date as day, count(*) as n
    from conversations c join channels ch on ch.id = c.channel_id
    where c.store_id = p_store_id and ch.platform <> 'playground' and c.handed_off_at >= v_from
    group by 1
  ),
  sales as (
    select (o.created_at at time zone 'UTC')::date as day, count(*) as n, coalesce(sum(o.total_cents), 0) as cents
    from orders o
    where o.store_id = p_store_id and o.status <> 'cancelled' and o.created_at >= v_from
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'day', to_char(s.day, 'YYYY-MM-DD'),
           'conversations', coalesce(convs.n, 0),
           'replies', coalesce(reps.n, 0),
           'handoffs', coalesce(hands.n, 0),
           'orders', coalesce(sales.n, 0),
           'revenue_cents', coalesce(sales.cents, 0)
         ) order by s.day), '[]'::jsonb)
    into v_series
    from series s
    left join convs on convs.day = s.day
    left join reps on reps.day = s.day
    left join hands on hands.day = s.day
    left join sales on sales.day = s.day;

  select jsonb_build_object(
    'conversations', (select count(*) from conversations c join channels ch on ch.id = c.channel_id
                      where c.store_id = p_store_id and ch.platform <> 'playground' and c.created_at >= v_from),
    'replies', (select count(*) from agent_runs r
                where r.store_id = p_store_id and r.source = 'customer' and r.created_at >= v_from),
    'handoffs', (select count(*) from conversations c join channels ch on ch.id = c.channel_id
                 where c.store_id = p_store_id and ch.platform <> 'playground' and c.handed_off_at >= v_from),
    'orders', (select count(*) from orders o
               where o.store_id = p_store_id and o.status <> 'cancelled' and o.created_at >= v_from),
    'revenue_cents', (select coalesce(sum(o.total_cents), 0) from orders o
                      where o.store_id = p_store_id and o.status <> 'cancelled' and o.created_at >= v_from)
  ) into v_totals;

  select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'quantity', t.quantity)
                  order by t.quantity desc, t.name), '[]'::jsonb)
    into v_top
    from (
      select oi.name, sum(oi.quantity)::integer as quantity
      from order_items oi
      join orders o on o.id = oi.order_id and o.store_id = oi.store_id
      where oi.store_id = p_store_id and o.status <> 'cancelled' and o.created_at >= v_from
      group by oi.name
      order by sum(oi.quantity) desc, oi.name
      limit 5
    ) t;

  select s.reply_credits into v_credits from stores s where s.id = p_store_id;

  return jsonb_build_object(
    'days', v_series,
    'totals', v_totals,
    'top_products', v_top,
    'reply_credits', coalesce(v_credits, 0)
  );
end $$;

-- Grants: signed-in members only. Trigger function is not an RPC.
revoke execute on function stamp_handed_off_at() from public, anon, authenticated;

revoke execute on function save_product(uuid, uuid, jsonb, jsonb) from public, anon;
revoke execute on function adjust_stock(uuid, integer) from public, anon;
revoke execute on function inbox_list(uuid, text, text, integer, timestamptz, uuid) from public, anon;
revoke execute on function store_insights(uuid, integer) from public, anon;
grant execute on function save_product(uuid, uuid, jsonb, jsonb) to authenticated;
grant execute on function adjust_stock(uuid, integer) to authenticated;
grant execute on function inbox_list(uuid, text, text, integer, timestamptz, uuid) to authenticated;
grant execute on function store_insights(uuid, integer) to authenticated;

-- 6. Realtime and search indexes ------------------------------------------------------------------
-- 0017 added conversations. Guarded so re-running the migration is safe.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

-- Trigram index for ilike '%term%' on message bodies (inbox search). pg_trgm lives in extensions (0002).
create index if not exists messages_body_trgm on public.messages using gin (body extensions.gin_trgm_ops);
