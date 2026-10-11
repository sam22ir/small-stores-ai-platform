-- Tenant isolation: a member of store A must not read or write store B, and anon sees nothing.
-- Run with `supabase test db` (pgTAP). Everything runs in one transaction that is rolled back.

begin;
select no_plan();

-- Seed (postgres superuser, bypasses RLS). User A owns store A, user B owns store B.
-- Every store-scoped table gets exactly one row per store.
insert into auth.users (id, aud, role, email) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'owner-a@rls.test'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'owner-b@rls.test');

insert into stores (id, name) values
  ('11111111-0000-0000-0000-00000000000a', 'Store A'),
  ('22222222-0000-0000-0000-00000000000b', 'Store B');

insert into store_members (store_id, user_id, role) values
  ('11111111-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000a', 'owner'),
  ('22222222-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-00000000000b', 'owner');

insert into channels (id, store_id, platform, external_id) values
  ('a1000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'facebook', 'page-a'),
  ('b1000000-0000-0000-0000-00000000000b', '22222222-0000-0000-0000-00000000000b', 'facebook', 'page-b');

insert into channel_credentials (channel_id, access_token_encrypted) values
  ('a1000000-0000-0000-0000-00000000000a', 'enc-a'),
  ('b1000000-0000-0000-0000-00000000000b', 'enc-b');

insert into products (id, store_id, name, price_cents) values
  ('a2000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'Product A', 1000),
  ('b2000000-0000-0000-0000-00000000000b', '22222222-0000-0000-0000-00000000000b', 'Product B', 2000);

insert into product_variants (id, store_id, product_id, label, stock_quantity) values
  ('a3000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'a2000000-0000-0000-0000-00000000000a', 'Default', 5),
  ('b3000000-0000-0000-0000-00000000000b', '22222222-0000-0000-0000-00000000000b', 'b2000000-0000-0000-0000-00000000000b', 'Default', 7);

insert into customers (id, store_id, channel_id, platform_user_id) values
  ('a4000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'psid-a'),
  ('b4000000-0000-0000-0000-00000000000b', '22222222-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-00000000000b', 'psid-b');

insert into conversations (id, store_id, channel_id, customer_id) values
  ('a5000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'a4000000-0000-0000-0000-00000000000a'),
  ('b5000000-0000-0000-0000-00000000000b', '22222222-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-00000000000b', 'b4000000-0000-0000-0000-00000000000b');

insert into messages (id, store_id, conversation_id, channel_id, direction, sender, body) values
  ('a6000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'a5000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'inbound', 'customer', 'hi A'),
  ('b6000000-0000-0000-0000-00000000000b', '22222222-0000-0000-0000-00000000000b', 'b5000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-00000000000b', 'inbound', 'customer', 'hi B');

insert into agent_runs (id, store_id, conversation_id, model) values
  ('a7000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'a5000000-0000-0000-0000-00000000000a', 'test-model'),
  ('b7000000-0000-0000-0000-00000000000b', '22222222-0000-0000-0000-00000000000b', 'b5000000-0000-0000-0000-00000000000b', 'test-model');

insert into delivery_fees (store_id, wilaya, fee_cents) values
  ('11111111-0000-0000-0000-00000000000a', 'Alger', 500),
  ('22222222-0000-0000-0000-00000000000b', 'Oran', 900);

insert into orders (id, store_id, customer_name, phone, wilaya, address, subtotal_cents, total_cents) values
  ('a8000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'Client A', '0550123456', 'Alger', 'Rue A', 1000, 1500),
  ('b8000000-0000-0000-0000-00000000000b', '22222222-0000-0000-0000-00000000000b', 'Client B', '0550123457', 'Oran', 'Rue B', 2000, 2900);

insert into order_items (store_id, order_id, name, quantity, unit_price_cents) values
  ('11111111-0000-0000-0000-00000000000a', 'a8000000-0000-0000-0000-00000000000a', 'Product A', 1, 1000),
  ('22222222-0000-0000-0000-00000000000b', 'b8000000-0000-0000-0000-00000000000b', 'Product B', 1, 2000);

insert into faq_entries (id, store_id, question, answer) values
  ('a9000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'Q A', 'A A'),
  ('b9000000-0000-0000-0000-00000000000b', '22222222-0000-0000-0000-00000000000b', 'Q B', 'A B');

insert into store_telegram (store_id, chat_id) values
  ('11111111-0000-0000-0000-00000000000a', 111),
  ('22222222-0000-0000-0000-00000000000b', 222);

-- Helpers (pg_temp, dropped with the session). Each one treats a table-level denial as "no rows".
create function pg_temp.visible_rows(t text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from public.%I', t) into n;
  return n;
exception when insufficient_privilege then
  return 0;
end $$;

create function pg_temp.visible_for_store(t text, col text, sid uuid) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from public.%I where %I = $1', t, col) into n using sid;
  return n;
exception when insufficient_privilege then
  return 0;
end $$;

-- True when the statement is rejected with insufficient_privilege (RLS WITH CHECK or missing grant).
create function pg_temp.write_denied(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when insufficient_privilege then
  return true;
end $$;

-- Rows touched by a DML statement; -1 when denied.
create function pg_temp.affected(stmt text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
exception when insufficient_privilege then
  return -1;
end $$;

-- Sanity: test seed visible to superuser (supabase/seed.sql adds its own demo rows, so scope to the test stores).
select is((select count(*) from products where store_id in ('11111111-0000-0000-0000-00000000000a', '22222222-0000-0000-0000-00000000000b')), 2::bigint, 'seed: two test products exist');

-- User A (member of store A only) -----------------------------------------
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

select is(pg_temp.visible_rows(t.name), 1::bigint, format('user A sees exactly one row in %s', t.name))
from (values ('stores'), ('store_members'), ('channels'), ('products'), ('product_variants'),
             ('customers'), ('conversations'), ('messages'), ('agent_runs'), ('delivery_fees'),
             ('orders'), ('order_items'), ('faq_entries')) as t(name);

select is(pg_temp.visible_for_store(t.name, t.col, '22222222-0000-0000-0000-00000000000b'), 0::bigint,
  format('user A sees no store B row in %s', t.name))
from (values ('stores', 'id'), ('store_members', 'store_id'), ('channels', 'store_id'),
             ('products', 'store_id'), ('product_variants', 'store_id'), ('customers', 'store_id'),
             ('conversations', 'store_id'), ('messages', 'store_id'), ('agent_runs', 'store_id'),
             ('delivery_fees', 'store_id'), ('orders', 'store_id'), ('order_items', 'store_id'),
             ('faq_entries', 'store_id')) as t(name, col);

select is(pg_temp.visible_for_store('stores', 'id', '11111111-0000-0000-0000-00000000000a'), 1::bigint,
  'user A sees own store');

select is(pg_temp.visible_rows('channel_credentials'), 0::bigint, 'user A sees 0 channel_credentials rows');
select is(pg_temp.visible_rows('store_telegram'), 0::bigint, 'user A sees 0 store_telegram rows');

-- Cross-store writes must be rejected, or match nothing.
select ok(pg_temp.write_denied($$insert into products (store_id, name, price_cents)
  values ('22222222-0000-0000-0000-00000000000b', 'Injected', 1)$$),
  'user A cannot insert a product into store B');

select ok(pg_temp.write_denied($$insert into messages (store_id, conversation_id, channel_id, direction, sender, body)
  values ('22222222-0000-0000-0000-00000000000b', 'b5000000-0000-0000-0000-00000000000b',
          'b1000000-0000-0000-0000-00000000000b', 'outbound', 'agent', 'injected')$$),
  'user A cannot insert a message into store B');

select ok(pg_temp.write_denied($$insert into faq_entries (store_id, question, answer)
  values ('22222222-0000-0000-0000-00000000000b', 'Q', 'A')$$),
  'user A cannot insert a FAQ entry into store B');

select ok(pg_temp.write_denied($$insert into delivery_fees (store_id, wilaya, fee_cents)
  values ('22222222-0000-0000-0000-00000000000b', 'Blida', 100)$$),
  'user A cannot insert a delivery fee into store B');

select ok(pg_temp.write_denied($$insert into orders (store_id, customer_name, phone, wilaya, address, subtotal_cents, total_cents)
  values ('22222222-0000-0000-0000-00000000000b', 'X', '0550000000', 'Oran', 'Y', 1, 1)$$),
  'user A cannot insert an order into store B');

select ok(pg_temp.write_denied($$update products set store_id = '22222222-0000-0000-0000-00000000000b'
  where id = 'a2000000-0000-0000-0000-00000000000a'$$),
  'user A cannot move own product into store B');

select is(pg_temp.affected($$update products set name = 'Hacked'
  where store_id = '22222222-0000-0000-0000-00000000000b'$$), 0::bigint,
  'user A updates 0 store B products');

select is(pg_temp.affected($$update faq_entries set answer = 'Hacked'
  where store_id = '22222222-0000-0000-0000-00000000000b'$$), 0::bigint,
  'user A updates 0 store B FAQ entries');

select is(pg_temp.affected($$delete from products
  where store_id = '22222222-0000-0000-0000-00000000000b'$$), 0::bigint,
  'user A deletes 0 store B products');

reset role;

-- Store B data is untouched by user A's attempts (superuser view).
select is((select name from products where id = 'b2000000-0000-0000-0000-00000000000b'), 'Product B',
  'store B product name unchanged');
select is((select answer from faq_entries where id = 'b9000000-0000-0000-0000-00000000000b'), 'A B',
  'store B FAQ answer unchanged');
select is((select count(*) from products where store_id = '22222222-0000-0000-0000-00000000000b'), 1::bigint,
  'store B still has exactly its own product');

-- Anon (no JWT) ------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
set local role anon;

select is(pg_temp.visible_rows(t.name), 0::bigint, format('anon sees nothing in %s', t.name))
from (values ('stores'), ('store_members'), ('channels'), ('channel_credentials'), ('products'),
             ('product_variants'), ('customers'), ('conversations'), ('messages'), ('agent_runs'),
             ('delivery_fees'), ('orders'), ('order_items'), ('faq_entries'), ('store_telegram')) as t(name);

select ok(pg_temp.write_denied($$insert into products (store_id, name, price_cents)
  values ('11111111-0000-0000-0000-00000000000a', 'Anon', 1)$$),
  'anon cannot insert a product');

reset role;

-- Reply credits and paid checkouts (0023_reply_credits.sql) --------------------------
-- Setup as the superuser: store A has one credit, and two pending payments for it.
update stores set reply_credits = 1 where id = '11111111-0000-0000-0000-00000000000a';
insert into payments (store_id, checkout_id, amount, currency, status, kind, credits) values
  ('11111111-0000-0000-0000-00000000000a', 'ch_rls_credits', 300, 'dzd', 'pending', 'credits', 5),
  ('11111111-0000-0000-0000-00000000000a', 'ch_rls_forged', 300, 'dzd', 'pending', 'credits', 500);

-- User A (owner of store A) cannot grant credits or mark payments paid.
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

select is((select reply_credits from stores where id = '11111111-0000-0000-0000-00000000000a'), 1,
  'user A can read own reply_credits');

select ok(pg_temp.write_denied($$update stores set reply_credits = 999
  where id = '11111111-0000-0000-0000-00000000000a'$$),
  'user A cannot UPDATE stores.reply_credits');

select ok(pg_temp.write_denied($$select consume_reply_credit('11111111-0000-0000-0000-00000000000a')$$),
  'user A cannot call consume_reply_credit');

select ok(pg_temp.write_denied($$select add_reply_credits('11111111-0000-0000-0000-00000000000a', 100)$$),
  'user A cannot call add_reply_credits');

select ok(pg_temp.write_denied($$select apply_paid_checkout('ch_rls_forged')$$),
  'user A cannot call apply_paid_checkout');

reset role;

select is((select reply_credits from stores where id = '11111111-0000-0000-0000-00000000000a'), 1,
  'store A balance unchanged after user A attempts');
select is((select status from payments where checkout_id = 'ch_rls_forged'), 'pending',
  'forged payment is still pending');

-- Service role (the edge functions) runs the three functions. Balance never goes below zero.
set local role service_role;

select is(consume_reply_credit('11111111-0000-0000-0000-00000000000a'), true, 'service role spends the one credit');
select is(consume_reply_credit('11111111-0000-0000-0000-00000000000a'), false, 'a spend at zero is refused');
select is(add_reply_credits('11111111-0000-0000-0000-00000000000a', 2), 2, 'service role adds credits');
select is(apply_paid_checkout('ch_rls_credits') ->> 'result', 'paid', 'a paid credit pack is applied once');
select is(apply_paid_checkout('ch_rls_credits') ->> 'result', 'duplicate', 'a replayed checkout is a duplicate');
select is(apply_paid_checkout('ch_rls_nope') ->> 'result', 'unknown_checkout', 'an unknown checkout changes nothing');

reset role;

select is((select reply_credits from stores where id = '11111111-0000-0000-0000-00000000000a'), 7,
  'balance is 1 - 1 + 2 + 5 = 7');
select is((select paid_until from stores where id = '11111111-0000-0000-0000-00000000000a'), null::timestamptz,
  'a credit pack leaves the paid period alone');

select * from finish();
rollback;
