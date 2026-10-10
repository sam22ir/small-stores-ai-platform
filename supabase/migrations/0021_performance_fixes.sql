-- Performance hardening after the production advisor run. Additive and non-destructive: no RLS, grant
-- or function changes, so the pgTAP policy tests are unaffected.
--
-- Advisor findings reviewed and deliberately NOT changed here:
--   * unused_index (19): statistics are young and most of these indexes back hot-path foreign keys or
--     filters added in 0009/0010/0012/0013/0015. Dropping them would be a guess; revisit after a few weeks
--     of traffic with pg_stat_user_indexes.
--   * rls_enabled_no_policy (3: channel_credentials, store_ai_cap_alerts, store_telegram): intentional.
--     These are server-only tables (service role), documented in 0001, 0016 and 0019.
--   * authenticated_security_definer_function_executable (6): create_store, set_order_status,
--     telegram_link, telegram_unlink are granted to clients on purpose (0008, 0010, 0016). is_store_member
--     and is_store_owner are still used by existing RLS policies, which run as the caller, so revoking
--     EXECUTE from authenticated would break them.
--   * auth_leaked_password_protection: a dashboard Auth setting, not changeable from SQL.

-- Hot path: hasNewerInbound() in pipeline/inbound.ts filters a conversation's inbound messages and
-- orders by created_at desc with limit 1. A partial index on exactly that shape keeps it an index scan.
create index if not exists messages_conversation_inbound_idx
  on public.messages (conversation_id, created_at desc)
  where direction = 'inbound';
