-- Dashboard test chats must not create real orders or consume stock.
-- Adds p_dry_run to place_order: same validation, locking and pricing, but nothing is written.
-- The original 9-argument function stays as a thin wrapper (DROP is avoided on purpose).

create or replace function place_order(
  p_store_id uuid,
  p_conversation_id uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_phone text,
  p_wilaya text,
  p_address text,
  p_items jsonb,
  p_key text,
  p_dry_run boolean
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
  if p_key is not null and not p_dry_run then
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
    if not p_dry_run then
      update product_variants set stock_quantity = stock_quantity - qty where id = v.id;
    end if;
    subtotal := subtotal + v.price * qty;
    lines := lines || jsonb_build_object('product_id', v.product_id, 'variant_id', v.id,
      'name', v.name, 'variant_label', v.label, 'quantity', qty, 'unit_price_cents', v.price);
  end loop;

  if p_dry_run then
    return jsonb_build_object('order_id', null, 'subtotal_cents', subtotal, 'delivery_fee_cents', fee,
      'total_cents', subtotal + fee, 'duplicate', false, 'dry_run', true);
  end if;

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
revoke execute on function place_order(uuid, uuid, uuid, text, text, text, text, jsonb, text, boolean) from public, anon, authenticated;
grant execute on function place_order(uuid, uuid, uuid, text, text, text, text, jsonb, text, boolean) to service_role;

-- The 9-argument version delegates (always a real order).
create or replace function place_order(
  p_store_id uuid,
  p_conversation_id uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_phone text,
  p_wilaya text,
  p_address text,
  p_items jsonb,
  p_key text default null
) returns jsonb
language sql security definer set search_path = public as $$
  select place_order(p_store_id, p_conversation_id, p_customer_id, p_customer_name, p_phone,
                     p_wilaya, p_address, p_items, p_key, false);
$$;
