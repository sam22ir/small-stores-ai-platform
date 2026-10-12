-- Delivery carrier connection (Yalidine) for live fee quotes.
-- store_carriers holds the owner's carrier API credentials, encrypted by the delivery-carrier Edge Function
-- (AES-GCM, key in the Edge secret CREDENTIALS_ENCRYPTION_KEY). Server-only, like channel_credentials:
-- RLS on with no policies, no grants to clients. The dashboard reads status through carrier_status() only.
-- Additive: delivery_fees only gains a column.

create table if not exists store_carriers (
  store_id uuid not null references stores(id) on delete cascade,
  carrier text not null check (carrier in ('yalidine')),
  api_id_encrypted text not null,
  api_token_encrypted text not null,
  from_wilaya_id integer not null check (from_wilaya_id between 1 and 69),
  fee_type text not null default 'home' check (fee_type in ('home', 'desk')),
  last_synced_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (store_id, carrier)
);

alter table store_carriers enable row level security;
revoke all on store_carriers from anon, authenticated;

-- Where a delivery fee came from: typed by the owner ('manual') or synced from a carrier. A sync keeps
-- manual fees unless the owner asks it to overwrite them.
alter table delivery_fees add column if not exists source text not null default 'manual'
  check (source in ('manual', 'yalidine'));

-- A fee edited from the dashboard (a signed-in user) becomes manual. Server syncs have no auth.uid().
create or replace function delivery_fees_mark_manual() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and new.fee_cents is distinct from old.fee_cents then
    new.source := 'manual';
  end if;
  return new;
end $$;

drop trigger if exists delivery_fees_mark_manual on delivery_fees;
create trigger delivery_fees_mark_manual before update on delivery_fees
  for each row execute function delivery_fees_mark_manual();

-- Connection status for the dashboard: never returns the credentials.
create or replace function carrier_status(p_store_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r record;
begin
  if not public.is_store_member(p_store_id) then
    raise exception 'not a member of this store';
  end if;
  select carrier, from_wilaya_id, fee_type, last_synced_at, last_error into r
    from public.store_carriers where store_id = p_store_id and carrier = 'yalidine';
  if not found then
    return jsonb_build_object('connected', false);
  end if;
  return jsonb_build_object(
    'connected', true, 'carrier', r.carrier, 'from_wilaya_id', r.from_wilaya_id,
    'fee_type', r.fee_type, 'last_synced_at', r.last_synced_at, 'last_error', r.last_error
  );
end $$;

revoke all on function carrier_status(uuid) from public, anon;
grant execute on function carrier_status(uuid) to authenticated;
