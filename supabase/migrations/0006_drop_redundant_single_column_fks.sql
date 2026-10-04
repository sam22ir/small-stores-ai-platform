-- The composite (child_id, store_id) foreign keys from 0004 already enforce existence and
-- cascade. Keeping the old single-column ones left two relationships between each pair of
-- tables, which makes PostgREST embeds (e.g. products -> product_variants) fail with PGRST201.
alter table product_variants drop constraint product_variants_product_id_fkey;
alter table customers drop constraint customers_channel_id_fkey;
alter table conversations drop constraint conversations_channel_id_fkey;
alter table conversations drop constraint conversations_customer_id_fkey;
alter table messages drop constraint messages_conversation_id_fkey;
alter table messages drop constraint messages_channel_id_fkey;
alter table agent_runs drop constraint agent_runs_conversation_id_fkey;
