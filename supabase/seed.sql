-- Demo store for local testing. Safe to run more than once.
do $$
declare
  s uuid;
  p uuid;
begin
  select id into s from stores where name = 'Demo Boutique';
  if s is not null then return; end if;

  insert into stores (name, currency, timezone, business_info)
  values (
    'Demo Boutique', 'USD', 'UTC',
    'Open every day 10:00-18:00. Shipping 3-5 business days, free over $60. Cash on delivery available in the city. Returns accepted within 7 days if unworn.'
  ) returning id into s;

  insert into products (store_id, name, description, price_cents)
  values (s, 'Black Hoodie', 'Heavy cotton oversized hoodie', 4500) returning id into p;
  insert into product_variants (store_id, product_id, sku, label, stock_quantity) values
    (s, p, 'HOOD-BLK-S', 'S', 0),
    (s, p, 'HOOD-BLK-M', 'M', 3),
    (s, p, 'HOOD-BLK-L', 'L', 24);

  insert into products (store_id, name, description, price_cents)
  values (s, 'Linen Shirt', 'Breathable linen button-up, two colors', 3800) returning id into p;
  insert into product_variants (store_id, product_id, sku, label, stock_quantity) values
    (s, p, 'LIN-WHT-M', 'White / M', 12),
    (s, p, 'LIN-WHT-L', 'White / L', 9),
    (s, p, 'LIN-SND-M', 'Sand / M', 0);

  insert into products (store_id, name, description, price_cents)
  values (s, 'Canvas Tote Bag', 'Everyday tote with inner pocket', 1800) returning id into p;
  insert into product_variants (store_id, product_id, sku, label, stock_quantity)
  values (s, p, 'TOTE-NAT', 'Natural', 40);

  insert into products (store_id, name, description, price_cents)
  values (s, 'Silver Hoop Earrings', 'Handmade, hypoallergenic', 2200) returning id into p;
  insert into product_variants (store_id, product_id, sku, label, stock_quantity)
  values (s, p, 'EAR-SLV', 'One size', 2);

  insert into products (store_id, name, description, price_cents)
  values (s, 'Leather Wallet', 'Slim bifold, brown leather', 3200) returning id into p;
  insert into product_variants (store_id, product_id, sku, label, stock_quantity)
  values (s, p, 'WAL-BRN', 'Brown', 0);
end $$;
