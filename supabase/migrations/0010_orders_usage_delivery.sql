-- Orders (cash on delivery), delivery fees, usage limits and run-source tagging.

-- Where an agent run came from; only 'customer' runs count towards the monthly limit.
alter table agent_runs add column if not exists source text not null default 'customer'
  check (source in ('customer', 'test', 'dev'));
-- Replies answered by the zero-cost fast path (greetings/thanks) are logged but not billed.
alter table agent_runs add column if not exists fast_path boolean not null default false;
create index if not exists agent_runs_store_month_idx on agent_runs (store_id, created_at)
  where source = 'customer' and fast_path = false;

alter table stores add column if not exists monthly_reply_limit integer not null default 1000
  check (monthly_reply_limit >= 0);
-- The agent only takes orders when the owner switches this on.
alter table stores add column if not exists orders_enabled boolean not null default false;

grant update (orders_enabled) on stores to authenticated;

-- Per-wilaya delivery fee (Algeria has 58). If a store has no rows, delivery is quoted as free/unknown.
create table if not exists delivery_fees (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  wilaya text not null check (length(trim(wilaya)) between 1 and 60),
  fee_cents integer not null check (fee_cents >= 0),
  created_at timestamptz not null default now()
);
create unique index if not exists delivery_fees_store_wilaya_uq on delivery_fees (store_id, lower(trim(wilaya)));

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  conversation_id uuid,
  customer_id uuid,
  customer_name text not null check (length(trim(customer_name)) between 1 and 120),
  phone text not null check (phone ~ '^0[567][0-9]{8}$'),
  wilaya text not null,
  address text not null check (length(trim(address)) between 1 and 300),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  delivery_fee_cents integer not null default 0 check (delivery_fee_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, store_id),
  foreign key (conversation_id, store_id) references conversations (id, store_id) on delete set null (conversation_id),
  foreign key (customer_id, store_id) references customers (id, store_id) on delete set null (customer_id)
);
create unique index if not exists orders_idem_uq on orders (store_id, idempotency_key) where idempotency_key is not null;
create index if not exists orders_store_created_idx on orders (store_id, created_at desc);
create index if not exists orders_conversation_idx on orders (conversation_id, store_id);
create index if not exists orders_customer_idx on orders (customer_id, store_id);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  order_id uuid not null,
  product_id uuid,
  variant_id uuid,
  name text not null,
  variant_label text not null default '',
  quantity integer not null check (quantity between 1 and 50),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  foreign key (order_id, store_id) references orders (id, store_id) on delete cascade
);
create index if not exists order_items_order_idx on order_items (order_id, store_id);
create index if not exists order_items_variant_idx on order_items (variant_id);

create or replace trigger orders_touch before update on orders
  for each row execute function touch_updated_at();

alter table delivery_fees enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

create policy delivery_fees_member on delivery_fees for all
  using (private.is_store_member(store_id)) with check (private.is_store_member(store_id));
create policy orders_member_read on orders for select using (private.is_store_member(store_id));
create policy order_items_member_read on order_items for select using (private.is_store_member(store_id));

grant select, insert, update, delete on delivery_fees to authenticated;
grant select on orders, order_items to authenticated;

-- Order placement is server-only (the agent runs with the service role). One transaction:
-- prices come from the catalog, stock is checked and decremented, duplicates are ignored.
create or replace function place_order(
  p_store_id uuid,
  p_conversation_id uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_phone text,
  p_wilaya text,
  p_address text,
  p_items jsonb,       -- [{"variant_id": "...", "quantity": 1}, ...]
  p_key text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  existing orders%rowtype;
  fee integer := 0;
  has_fees boolean;
  subtotal integer := 0;
  item jsonb;
  v record;
  qty integer;
  new_id uuid;
  lines jsonb := '[]'::jsonb;
begin
  if p_key is not null then
    select * into existing from orders where store_id = p_store_id and idempotency_key = p_key;
    if found then
      return jsonb_build_object('order_id', existing.id, 'total_cents', existing.total_cents,
        'subtotal_cents', existing.subtotal_cents, 'delivery_fee_cents', existing.delivery_fee_cents,
        'duplicate', true);
    end if;
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 10 then
    raise exception 'items must contain 1-10 lines';
  end if;

  select exists (select 1 from delivery_fees where store_id = p_store_id) into has_fees;
  if has_fees then
    select fee_cents into fee from delivery_fees
      where store_id = p_store_id and lower(trim(wilaya)) = lower(trim(p_wilaya));
    if not found then
      raise exception 'wilaya_not_served';
    end if;
  end if;

  -- Lock variants in a stable order so concurrent orders cannot deadlock.
  for item in select value from jsonb_array_elements(p_items) order by value->>'variant_id' loop
    qty := (item->>'quantity')::integer;
    if qty is null or qty < 1 or qty > 50 then
      raise exception 'invalid quantity';
    end if;
    select pv.id, pv.label, pv.stock_quantity, coalesce(pv.price_cents, p.price_cents) as price,
           p.id as product_id, p.name
      into v
      from product_variants pv join products p on p.id = pv.product_id and p.store_id = pv.store_id
      where pv.id = (item->>'variant_id')::uuid and pv.store_id = p_store_id and p.active
      for update of pv;
    if not found then
      raise exception 'unknown_variant';
    end if;
    if v.stock_quantity < qty then
      raise exception 'insufficient_stock:%', v.name || ' ' || v.label;
    end if;
    update product_variants set stock_quantity = stock_quantity - qty where id = v.id;
    subtotal := subtotal + v.price * qty;
    lines := lines || jsonb_build_object('product_id', v.product_id, 'variant_id', v.id,
      'name', v.name, 'variant_label', v.label, 'quantity', qty, 'unit_price_cents', v.price);
  end loop;

  insert into orders (store_id, conversation_id, customer_id, customer_name, phone, wilaya, address,
                      subtotal_cents, delivery_fee_cents, total_cents, idempotency_key)
  values (p_store_id, p_conversation_id, p_customer_id, trim(p_customer_name), p_phone, trim(p_wilaya),
          trim(p_address), subtotal, fee, subtotal + fee, p_key)
  returning id into new_id;

  insert into order_items (store_id, order_id, product_id, variant_id, name, variant_label, quantity, unit_price_cents)
  select p_store_id, new_id, (l->>'product_id')::uuid, (l->>'variant_id')::uuid, l->>'name',
         l->>'variant_label', (l->>'quantity')::integer, (l->>'unit_price_cents')::integer
  from jsonb_array_elements(lines) l;

  return jsonb_build_object('order_id', new_id, 'subtotal_cents', subtotal, 'delivery_fee_cents', fee,
    'total_cents', subtotal + fee, 'duplicate', false);
end $$;
revoke execute on function place_order(uuid, uuid, uuid, text, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function place_order(uuid, uuid, uuid, text, text, text, text, jsonb, text) to service_role;

-- Owner action: move an order along its lifecycle. Cancelling returns the stock.
create or replace function set_order_status(p_order_id uuid, p_status text) returns text
language plpgsql security definer set search_path = public as $$
declare
  o orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select * into o from orders where id = p_order_id for update;
  if not found or not private.is_store_member(o.store_id) then
    raise exception 'order not found';
  end if;
  if p_status not in ('confirmed', 'shipped', 'delivered', 'cancelled') then
    raise exception 'invalid status';
  end if;
  if not (
    (o.status = 'pending' and p_status in ('confirmed', 'cancelled')) or
    (o.status = 'confirmed' and p_status in ('shipped', 'cancelled')) or
    (o.status = 'shipped' and p_status in ('delivered', 'cancelled'))
  ) then
    raise exception 'cannot change an order from % to %', o.status, p_status;
  end if;
  if p_status = 'cancelled' then
    update product_variants pv set stock_quantity = pv.stock_quantity + oi.quantity
      from order_items oi
      where oi.order_id = o.id and oi.store_id = o.store_id and pv.id = oi.variant_id and pv.store_id = o.store_id;
  end if;
  update orders set status = p_status where id = o.id;
  return p_status;
end $$;
revoke execute on function set_order_status(uuid, text) from public, anon;
grant execute on function set_order_status(uuid, text) to authenticated;
