-- Telegram alerts to the store owner.
-- The owner links one Telegram chat per store: the dashboard shows a one-time code via telegram_link(),
-- the owner sends "/start <code>" to the bot, and the telegram-webhook function stores the chat id.
-- Server-only table, like channel_credentials: RLS on with no policies, no grants to clients.
-- Clients reach it only through the RPCs below. Additive; stores is not changed.

create table if not exists store_telegram (
  store_id uuid primary key references stores(id) on delete cascade,
  chat_id bigint,
  link_code text unique,
  updated_at timestamptz not null default now()
);

alter table store_telegram enable row level security;
revoke all on store_telegram from anon, authenticated;

-- Returns whether a chat is linked, and a code to send with /start (generated once, then reused).
create or replace function telegram_link(p_store_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_chat bigint;
  v_code text;
begin
  if not public.is_store_member(p_store_id) then
    raise exception 'not a member of this store';
  end if;
  select chat_id, link_code into v_chat, v_code
    from public.store_telegram where store_id = p_store_id;
  if v_code is null then
    -- 122 random bits from gen_random_uuid() (built in, no extension needed), as 32 hex characters.
    v_code := replace(gen_random_uuid()::text, '-', '');
    insert into public.store_telegram (store_id, link_code, updated_at)
    values (p_store_id, v_code, now())
    on conflict (store_id) do update set link_code = excluded.link_code, updated_at = now();
  end if;
  return jsonb_build_object('connected', v_chat is not null, 'code', v_code);
end $$;

-- Stops alerts and forgets any pending code.
create or replace function telegram_unlink(p_store_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_store_member(p_store_id) then
    raise exception 'not a member of this store';
  end if;
  delete from public.store_telegram where store_id = p_store_id;
end $$;

revoke execute on function telegram_link(uuid) from public, anon;
revoke execute on function telegram_unlink(uuid) from public, anon;
grant execute on function telegram_link(uuid) to authenticated;
grant execute on function telegram_unlink(uuid) to authenticated;
