-- Structured "what the assistant should know" (hours, delivery, payment, returns, address, other).
-- The dashboard composes these into stores.business_info, which is what the assistant reads;
-- the fields are kept so the form can be shown again as filled in.
alter table stores add column if not exists business_info_fields jsonb
  check (business_info_fields is null or jsonb_typeof(business_info_fields) = 'object');
grant update (business_info_fields) on stores to authenticated;
