-- Advisor fixes: keep extensions out of public, restrict who can call the RLS helper.
create schema if not exists extensions;
alter extension pg_trgm set schema extensions;

revoke execute on function public.is_store_member(uuid) from public, anon;
grant execute on function public.is_store_member(uuid) to authenticated;
