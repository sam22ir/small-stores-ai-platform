-- 1. Cross-tenant integrity.
-- RLS only checks a row's own store_id, so without composite foreign keys a member of
-- store A could attach rows to store B's products/conversations (e.g. inject variants
-- into B's catalog). Child rows must now share their parent's store_id.
alter table channels      add constraint channels_id_store_uk      unique (id, store_id);
alter table products      add constraint products_id_store_uk      unique (id, store_id);
alter table customers     add constraint customers_id_store_uk     unique (id, store_id);
alter table conversations add constraint conversations_id_store_uk unique (id, store_id);

alter table product_variants add constraint variants_product_store_fk
  foreign key (product_id, store_id) references products (id, store_id) on delete cascade;
alter table customers add constraint customers_channel_store_fk
  foreign key (channel_id, store_id) references channels (id, store_id) on delete cascade;
alter table conversations add constraint conversations_channel_store_fk
  foreign key (channel_id, store_id) references channels (id, store_id) on delete cascade;
alter table conversations add constraint conversations_customer_store_fk
  foreign key (customer_id, store_id) references customers (id, store_id) on delete cascade;
alter table messages add constraint messages_conversation_store_fk
  foreign key (conversation_id, store_id) references conversations (id, store_id) on delete cascade;
alter table messages add constraint messages_channel_store_fk
  foreign key (channel_id, store_id) references channels (id, store_id) on delete cascade;
alter table agent_runs add constraint agent_runs_conversation_store_fk
  foreign key (conversation_id, store_id) references conversations (id, store_id) on delete cascade;
