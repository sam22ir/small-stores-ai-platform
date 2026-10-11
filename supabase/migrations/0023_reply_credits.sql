-- Reply credits: extra AI replies a store can buy on top of its monthly plan.
-- Additive. Only the service role (edge functions) changes balances; clients can read them.

-- Balance of bought replies. Never expires; spent one per reply once the included monthly replies are used.
alter table stores add column if not exists reply_credits integer not null default 0
  check (reply_credits >= 0);

-- Marks a reply paid for with a credit. Those replies are left out of the monthly token cap
-- (the cap is a safety net for the included replies; a paid pack must not be blocked by it).
alter table agent_runs add column if not exists used_credit boolean not null default false;

-- A payment is either the monthly subscription or a credit pack.
alter table payments add column if not exists kind text not null default 'subscription'
  check (kind in ('subscription', 'credits'));
alter table payments add column if not exists credits integer check (credits is null or credits > 0);
alter table payments drop constraint if exists payments_credits_matches_kind;
alter table payments add constraint payments_credits_matches_kind
  check ((kind = 'credits') = (credits is not null));

-- Spends one credit. True if a credit was spent. Atomic: the balance never goes below zero.
create or replace function consume_reply_credit(p_store_id uuid) returns boolean
language sql security definer set search_path = public as $$
  with spent as (
    update stores set reply_credits = reply_credits - 1
    where id = p_store_id and reply_credits > 0
    returning 1
  )
  select exists (select 1 from spent);
$$;

-- Adds credits (a purchase, or a refund of one spent credit). Returns the new balance, null if no such store.
create or replace function add_reply_credits(p_store_id uuid, p_n integer) returns integer
language plpgsql security definer set search_path = public as $$
declare
  bal integer;
begin
  if p_n is null or p_n <= 0 then
    raise exception 'p_n must be positive';
  end if;
  update stores set reply_credits = reply_credits + p_n where id = p_store_id returning reply_credits into bal;
  return bal;
end $$;

-- A paid Chargily checkout, applied in ONE transaction: claim the payment (pending -> paid) and grant what
-- it bought. If anything fails the claim rolls back too, so Chargily's retry finishes the job.
-- Returns {"result": "paid" | "duplicate" | "unknown_checkout", ...}.
create or replace function apply_paid_checkout(p_checkout_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p payments%rowtype;
  new_until timestamptz;
  bal integer;
begin
  update payments set status = 'paid', updated_at = now()
  where checkout_id = p_checkout_id and status = 'pending'
  returning * into p;

  if not found then
    if exists (select 1 from payments where checkout_id = p_checkout_id) then
      return jsonb_build_object('result', 'duplicate');
    end if;
    return jsonb_build_object('result', 'unknown_checkout');
  end if;

  if p.kind = 'credits' then
    update stores set reply_credits = reply_credits + p.credits where id = p.store_id returning reply_credits into bal;
    return jsonb_build_object('result', 'paid', 'kind', 'credits', 'store_id', p.store_id, 'reply_credits', bal);
  end if;

  -- Subscription: 30 days from the later of now and the current paid_until.
  update stores
  set plan_status = 'active', paid_until = greatest(now(), coalesce(paid_until, now())) + interval '30 days'
  where id = p.store_id
  returning paid_until into new_until;
  return jsonb_build_object('result', 'paid', 'kind', 'subscription', 'store_id', p.store_id, 'paid_until', new_until);
end $$;

-- Service role only: a client that could call these would grant itself credits or months.
revoke execute on function consume_reply_credit(uuid) from public, anon, authenticated;
revoke execute on function add_reply_credits(uuid, integer) from public, anon, authenticated;
revoke execute on function apply_paid_checkout(text) from public, anon, authenticated;
grant execute on function consume_reply_credit(uuid) to service_role;
grant execute on function add_reply_credits(uuid, integer) to service_role;
grant execute on function apply_paid_checkout(text) to service_role;
