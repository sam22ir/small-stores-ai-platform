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

insert into store_carriers (store_id, carrier, api_id_encrypted, api_token_encrypted, from_wilaya_id) values
  ('11111111-0000-0000-0000-00000000000a', 'yalidine', 'enc-id-a', 'enc-token-a', 16),
  ('22222222-0000-0000-0000-00000000000b', 'yalidine', 'enc-id-b', 'enc-token-b', 31);

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
select is(pg_temp.visible_rows('store_carriers'), 0::bigint, 'user A sees 0 store_carriers rows (credentials are server-only)');

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
             ('delivery_fees'), ('orders'), ('order_items'), ('faq_entries'), ('store_telegram'), ('store_carriers')) as t(name);

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
-- Store B pays the monthly subscription (default kind), to cover that branch of apply_paid_checkout.
insert into payments (store_id, checkout_id, amount, currency, status) values
  ('22222222-0000-0000-0000-00000000000b', 'ch_rls_sub', 1000, 'dzd', 'pending');

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
select is(apply_paid_checkout('ch_rls_sub') ->> 'result', 'paid', 'a paid subscription is applied');

reset role;

select is((select reply_credits from stores where id = '11111111-0000-0000-0000-00000000000a'), 7,
  'balance is 1 - 1 + 2 + 5 = 7');
select is((select paid_until from stores where id = '11111111-0000-0000-0000-00000000000a'), null::timestamptz,
  'a credit pack leaves the paid period alone');

select is((select plan_status from stores where id = '22222222-0000-0000-0000-00000000000b'), 'active',
  'a paid subscription activates the plan');
select ok((select paid_until from stores where id = '22222222-0000-0000-0000-00000000000b')
  between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour',
  'a paid subscription extends paid_until by about 30 days');

set local role service_role;
select is(apply_paid_checkout('ch_rls_sub') ->> 'result', 'duplicate', 'a replayed subscription checkout is a duplicate');
reset role;
select ok((select paid_until from stores where id = '22222222-0000-0000-0000-00000000000b')
  between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour',
  'a replayed subscription checkout does not extend paid_until again');

-- Dashboard RPCs (0024_dashboard_rpcs.sql) ----------------------------------------------
-- Raises any error (used for RPC rejections; insufficient_privilege included).
create function pg_temp.raises(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return true;
end $$;

-- Fixtures (superuser). Store A gets a second and third customer conversation, a playground conversation
-- (must be hidden), and messages with Darija, Arabic and '%' content. Timestamps are fixed for paging.
insert into channels (id, store_id, platform, external_id) values
  ('a1100000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'playground', 'pg-a');

insert into customers (id, store_id, channel_id, platform_user_id, display_name) values
  ('a4100000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'psid-a2', 'Yasmine'),
  ('a4200000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'psid-a3', null),
  ('a4300000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'a1100000-0000-0000-0000-00000000000a', 'pg-user', 'Tester');

insert into conversations (id, store_id, channel_id, customer_id, last_customer_message_at) values
  ('a5100000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'a4100000-0000-0000-0000-00000000000a', '2026-10-10 12:00:00+00'),
  ('a5300000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'a4200000-0000-0000-0000-00000000000a', null),
  ('a5200000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'a1100000-0000-0000-0000-00000000000a', 'a4300000-0000-0000-0000-00000000000a', '2026-10-10 13:00:00+00');

update conversations set last_customer_message_at = '2026-10-10 10:00:00+00'
where id = 'a5000000-0000-0000-0000-00000000000a';

insert into messages (id, store_id, conversation_id, channel_id, direction, sender, body) values
  ('a6100000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'a5000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'inbound', 'customer', 'chhal taman lhoodie'),
  ('a6200000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'a5000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'inbound', 'customer', 'عندكم هودي أسود؟'),
  ('a6300000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'a5100000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'inbound', 'customer', 'promo 50% off'),
  ('a6400000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'a5200000-0000-0000-0000-00000000000a', 'a1100000-0000-0000-0000-00000000000a', 'inbound', 'customer', 'هودي test playground');

-- Insights data: a test-source run (not a customer reply), a cancelled order (excluded), and items.
insert into agent_runs (id, store_id, conversation_id, model, source) values
  ('a7100000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'a5000000-0000-0000-0000-00000000000a', 'test-model', 'test');

insert into orders (id, store_id, customer_name, phone, wilaya, address, subtotal_cents, total_cents, status) values
  ('a8100000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a', 'Client C', '0550123458', 'Alger', 'Rue C', 9999, 9999, 'cancelled');

insert into order_items (store_id, order_id, name, quantity, unit_price_cents) values
  ('11111111-0000-0000-0000-00000000000a', 'a8000000-0000-0000-0000-00000000000a', 'Hoodie', 3, 500),
  ('11111111-0000-0000-0000-00000000000a', 'a8100000-0000-0000-0000-00000000000a', 'Cancelled item', 10, 999);

-- Handoff stamping, as superuser: a new reason stamps; the reset below lets the takeover check start clean.
update conversations set status = 'human', handoff_reason = 'refund'
where id = 'a5000000-0000-0000-0000-00000000000a';
update conversations set handoff_reason = 'wants a human'
where id = 'a5300000-0000-0000-0000-00000000000a';

select ok((select handed_off_at from conversations where id = 'a5000000-0000-0000-0000-00000000000a') is not null,
  'handed_off_at is stamped when a handoff reason is set');
select ok((select handed_off_at from conversations where id = 'a5300000-0000-0000-0000-00000000000a') is not null,
  'handed_off_at is stamped on a second conversation too');

update conversations set handed_off_at = null where id = 'a5300000-0000-0000-0000-00000000000a';

-- Owner takeover (status -> human, reason unchanged) by user A must not stamp.
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

select is(pg_temp.affected($$update conversations set status = 'human'
  where id = 'a5300000-0000-0000-0000-00000000000a'$$), 1::bigint, 'user A takes over a conversation (status only)');

reset role;
select is((select handed_off_at from conversations where id = 'a5300000-0000-0000-0000-00000000000a'), null::timestamptz,
  'owner takeover with unchanged reason does not stamp handed_off_at');

-- handoff_summary: written by the agent only. A member cannot write it, and the trigger clears it when the chat leaves 'human'.
update conversations set handoff_summary = 'Wants 2 hoodies, size M' where id = 'a5300000-0000-0000-0000-00000000000a';
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$update conversations set handoff_summary = 'Hacked' where id = 'a5300000-0000-0000-0000-00000000000a'$$,
  '42501', NULL, 'a member cannot write handoff_summary');
reset role;
select is((select handoff_summary from conversations where id = 'a5300000-0000-0000-0000-00000000000a'), 'Wants 2 hoodies, size M',
  'handoff_summary is untouched by the rejected member write');
update conversations set status = 'bot' where id = 'a5300000-0000-0000-0000-00000000000a';
select is((select handoff_summary from conversations where id = 'a5300000-0000-0000-0000-00000000000a'), null::text,
  'handoff_summary is cleared when the chat leaves human');
update conversations set status = 'human' where id = 'a5300000-0000-0000-0000-00000000000a';

-- Inbox (user A) ----------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*) from inbox_list('11111111-0000-0000-0000-00000000000a', null, null)), 3::bigint,
  'inbox_list returns store A conversations and not the playground one');
select is((select id from inbox_list('11111111-0000-0000-0000-00000000000a', null, null) limit 1),
  'a5100000-0000-0000-0000-00000000000a'::uuid, 'inbox_list orders by newest customer message first');
select is((select count(*) from inbox_list('11111111-0000-0000-0000-00000000000a', null, null, 100)
           where platform = 'playground'), 0::bigint, 'inbox_list never returns a playground channel');

select is((select count(*) from inbox_list('11111111-0000-0000-0000-00000000000a', null, 'هودي')), 1::bigint,
  'Arabic search finds the message body and skips the playground match');
select is((select id from inbox_list('11111111-0000-0000-0000-00000000000a', null, 'هودي')),
  'a5000000-0000-0000-0000-00000000000a'::uuid, 'Arabic search returns the right conversation');
select is((select id from inbox_list('11111111-0000-0000-0000-00000000000a', null, 'chhal')),
  'a5000000-0000-0000-0000-00000000000a'::uuid, 'Darija search finds the message body');
select is((select id from inbox_list('11111111-0000-0000-0000-00000000000a', null, 'yasm')),
  'a5100000-0000-0000-0000-00000000000a'::uuid, 'search matches the customer display name');
select is((select id from inbox_list('11111111-0000-0000-0000-00000000000a', null, '%')),
  'a5100000-0000-0000-0000-00000000000a'::uuid, 'a literal % only matches the body that contains it');
select is((select count(*) from inbox_list('11111111-0000-0000-0000-00000000000a', null, '_')), 0::bigint,
  'a literal _ matches nothing here (escaped, not a wildcard)');

select is((select count(*) from inbox_list('11111111-0000-0000-0000-00000000000a', 'human', null)), 2::bigint,
  'status filter returns the human conversations');
select is((select count(*) from inbox_list('11111111-0000-0000-0000-00000000000a', 'bot', null)), 1::bigint,
  'status filter returns the bot conversations');

-- Keyset paging: 12:00, then 10:00, then the null one last.
select is((select id from inbox_list('11111111-0000-0000-0000-00000000000a', null, null, 1,
  '2026-10-10 12:00:00+00', 'a5100000-0000-0000-0000-00000000000a')), 'a5000000-0000-0000-0000-00000000000a'::uuid,
  'keyset page 2 starts after the cursor row');
select is((select id from inbox_list('11111111-0000-0000-0000-00000000000a', null, null, 1,
  '2026-10-10 10:00:00+00', 'a5000000-0000-0000-0000-00000000000a')), 'a5300000-0000-0000-0000-00000000000a'::uuid,
  'keyset page 3 reaches the conversation with no customer message');
select is((select count(*) from inbox_list('11111111-0000-0000-0000-00000000000a', null, null, 1,
  null, 'a5300000-0000-0000-0000-00000000000a')), 0::bigint,
  'a null-ordered cursor returns nothing after the last row');
select is((select count(*) from inbox_list('11111111-0000-0000-0000-00000000000a', null, null, 500)), 3::bigint,
  'inbox_list accepts a large limit (capped at 100 internally)');

select ok(pg_temp.raises($$select * from inbox_list('22222222-0000-0000-0000-00000000000b', null, null)$$),
  'user A cannot list store B conversations');

-- save_product -------------------------------------------------------------------------
select lives_ok($$select save_product('11111111-0000-0000-0000-00000000000a', null,
  '{"name":"Hoodie","price_cents":2500,"active":true,"aliases":"kapuchon, هودي"}',
  '[{"label":"M","stock_quantity":3},{"label":"L","stock_quantity":0}]')$$,
  'save_product creates a product in one call');

select is((select count(*) from product_variants pv join products p on p.id = pv.product_id
           where p.name = 'Hoodie' and p.store_id = '11111111-0000-0000-0000-00000000000a'), 2::bigint,
  'save_product creates both variants with the product');

select is(save_product('11111111-0000-0000-0000-00000000000a', 'a2000000-0000-0000-0000-00000000000a',
  '{"name":"Product A v2","price_cents":1200,"active":true}',
  '[{"id":"a3000000-0000-0000-0000-00000000000a","label":"Default","stock_quantity":9},{"label":"Red","stock_quantity":4}]'),
  'a2000000-0000-0000-0000-00000000000a'::uuid, 'save_product updates an existing product and returns its id');

select is((select count(*) from product_variants where product_id = 'a2000000-0000-0000-0000-00000000000a'), 2::bigint,
  'save_product adds a new variant next to the kept one');

select lives_ok($$select save_product('11111111-0000-0000-0000-00000000000a', 'a2000000-0000-0000-0000-00000000000a',
  '{"name":"Product A v2","price_cents":1200,"active":true}',
  '[{"id":"a3000000-0000-0000-0000-00000000000a","label":"Default","stock_quantity":9}]')$$,
  'save_product removes a variant that is no longer listed');

select is((select count(*) from product_variants where product_id = 'a2000000-0000-0000-0000-00000000000a'), 1::bigint,
  'the unlisted variant is deleted');

select ok(pg_temp.raises($$select save_product('11111111-0000-0000-0000-00000000000a', 'a2000000-0000-0000-0000-00000000000a',
  '{"name":"Rolled back","price_cents":1}',
  '[{"id":"b3000000-0000-0000-0000-00000000000b","label":"x","stock_quantity":1}]')$$),
  'save_product rejects a store B variant id, even from a store A member');

select ok(pg_temp.raises($$select save_product('11111111-0000-0000-0000-00000000000a', null,
  '{"name":"Ghost","price_cents":1}',
  '[{"id":"b3000000-0000-0000-0000-00000000000b","label":"x","stock_quantity":1}]')$$),
  'save_product rejects a foreign variant id on a new product');

select ok(pg_temp.raises($$select save_product('22222222-0000-0000-0000-00000000000b', null,
  '{"name":"Not mine","price_cents":1}', '[]')$$),
  'user A cannot save a product into store B');

select ok(pg_temp.raises($$select save_product('11111111-0000-0000-0000-00000000000a', 'b2000000-0000-0000-0000-00000000000b',
  '{"name":"Hacked","price_cents":1}', '[]')$$),
  'user A cannot update store B product through save_product');

-- adjust_stock -------------------------------------------------------------------------
select is(adjust_stock('a3000000-0000-0000-0000-00000000000a', -2), 7, 'adjust_stock applies a relative change');
select is(adjust_stock('a3000000-0000-0000-0000-00000000000a', -100), 0, 'adjust_stock floors at zero');
select is(adjust_stock('a3000000-0000-0000-0000-00000000000a', 4), 4, 'adjust_stock adds stock back');
select ok(pg_temp.raises($$select adjust_stock('b3000000-0000-0000-0000-00000000000b', 5)$$),
  'user A cannot adjust store B stock');
select ok(pg_temp.raises($$select adjust_stock('a3000000-0000-0000-0000-00000000000a', null)$$),
  'adjust_stock rejects a null delta instead of zeroing the stock');

-- store_insights -----------------------------------------------------------------------
select is(jsonb_array_length(store_insights('11111111-0000-0000-0000-00000000000a', 7) -> 'days'), 7,
  'store_insights returns one entry per day');
select is(jsonb_array_length(store_insights('11111111-0000-0000-0000-00000000000a', 0) -> 'days'), 1,
  'store_insights clamps days below 1');
select is(jsonb_array_length(store_insights('11111111-0000-0000-0000-00000000000a', 500) -> 'days'), 90,
  'store_insights clamps days above 90');
select is((store_insights('11111111-0000-0000-0000-00000000000a', 7) -> 'totals' ->> 'conversations')::int, 3,
  'insights count store A conversations, not playground or store B');
select is((store_insights('11111111-0000-0000-0000-00000000000a', 7) -> 'totals' ->> 'replies')::int, 1,
  'insights count customer replies only (test runs excluded)');
select is((store_insights('11111111-0000-0000-0000-00000000000a', 7) -> 'totals' ->> 'handoffs')::int, 1,
  'insights count handoffs by handed_off_at (takeover did not add one)');
select is((store_insights('11111111-0000-0000-0000-00000000000a', 7) -> 'totals' ->> 'orders')::int, 1,
  'insights exclude cancelled orders from the order count');
select is((store_insights('11111111-0000-0000-0000-00000000000a', 7) -> 'totals' ->> 'revenue_cents')::int, 1500,
  'insights revenue excludes cancelled orders');
select is(store_insights('11111111-0000-0000-0000-00000000000a', 7) -> 'top_products' -> 0 ->> 'name', 'Hoodie',
  'top products lists the most ordered product first');
select is((store_insights('11111111-0000-0000-0000-00000000000a', 7) -> 'top_products' -> 0 ->> 'quantity')::int, 3,
  'top products sums quantity, excluding cancelled orders');
select ok(pg_temp.raises($$select store_insights('22222222-0000-0000-0000-00000000000b', 7)$$),
  'user A cannot read store B insights');
select is((store_insights('11111111-0000-0000-0000-00000000000a', 7) ->> 'reply_credits')::int,
  (select reply_credits from stores where id = '11111111-0000-0000-0000-00000000000a'),
  'insights report the store reply credits');

-- Product photos (0029_product_images.sql). User A is still authenticated here.
select lives_ok($$insert into storage.objects (bucket_id, name) values
  ('product-images', '11111111-0000-0000-0000-00000000000a/photo-a.jpg')$$,
  'a member can upload a product photo under their own store folder');

select ok(pg_temp.write_denied($$insert into storage.objects (bucket_id, name) values
  ('product-images', '22222222-0000-0000-0000-00000000000b/photo-b.jpg')$$),
  'a member cannot upload a product photo under another store folder');

select ok(pg_temp.write_denied($$insert into storage.objects (bucket_id, name) values
  ('product-images', 'not-a-uuid/photo.jpg')$$),
  'a folder that is not a store id is rejected without a cast error');

-- Update and delete are checked through the policy catalog, not by running them against storage internals.
select is((select array_agg(cmd::text order by cmd) from pg_policies
           where schemaname = 'storage' and tablename = 'objects' and policyname like 'product_images_member_%'
             and 'authenticated' = any(roles)),
  array['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
  'product-images storage policies exist for authenticated on select, insert, update and delete');

select lives_ok($$select save_product('11111111-0000-0000-0000-00000000000a', null,
  '{"name":"Photo own","price_cents":100,"image_url":"https://x.test/storage/v1/object/public/product-images/11111111-0000-0000-0000-00000000000a/a.jpg"}', '[]')$$,
  'save_product accepts a photo URL in its own store folder');

select lives_ok($$select save_product('11111111-0000-0000-0000-00000000000a', null,
  '{"name":"Photo foreign","price_cents":100,"image_url":"https://x.test/storage/v1/object/public/product-images/22222222-0000-0000-0000-00000000000b/b.jpg"}', '[]')$$,
  'save_product accepts a foreign photo URL without failing (the URL is dropped)');

reset role;

select is((select image_url from products where name = 'Photo own'),
  'https://x.test/storage/v1/object/public/product-images/11111111-0000-0000-0000-00000000000a/a.jpg',
  'save_product stores the photo URL of its own store folder');

select is((select image_url from products where name = 'Photo foreign'), null::text,
  'save_product stores null for a photo URL of another store folder');

-- Final state (superuser): denied writes changed nothing.
select is((select name from products where id = 'a2000000-0000-0000-0000-00000000000a'), 'Product A v2',
  'a rejected save_product rolled back its product update');
select is((select count(*) from products where name in ('Rolled back', 'Ghost', 'Not mine', 'Hacked')), 0::bigint,
  'rejected save_product calls left no product rows');
select is((select stock_quantity from product_variants where id = 'b3000000-0000-0000-0000-00000000000b'), 7,
  'store B stock is unchanged by user A');

-- Anon: no new function is executable without a session, and the grants are as intended.
select ok(not has_function_privilege('anon', 'public.save_product(uuid,uuid,jsonb,jsonb)', 'execute'),
  'anon cannot execute save_product');
select ok(not has_function_privilege('anon', 'public.adjust_stock(uuid,integer)', 'execute'),
  'anon cannot execute adjust_stock');
select ok(not has_function_privilege('anon', 'public.inbox_list(uuid,text,text,integer,timestamptz,uuid)', 'execute'),
  'anon cannot execute inbox_list');
select ok(not has_function_privilege('anon', 'public.store_insights(uuid,integer)', 'execute'),
  'anon cannot execute store_insights');
select ok(has_function_privilege('authenticated', 'public.inbox_list(uuid,text,text,integer,timestamptz,uuid)', 'execute'),
  'authenticated can execute inbox_list');

set local role anon;
select ok(pg_temp.write_denied($$select * from inbox_list('11111111-0000-0000-0000-00000000000a', null, null)$$),
  'anon call to inbox_list is denied');
reset role;

select * from finish();
rollback;
