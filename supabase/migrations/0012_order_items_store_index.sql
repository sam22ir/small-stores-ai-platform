-- Advisor: order_items.store_id foreign key had no covering index.
create index if not exists order_items_store_idx on public.order_items (store_id);
