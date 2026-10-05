-- Delivery of replies to Instagram (and later Facebook).
-- delivery_claimed_at: a sender takes a pending message by setting this atomically, so two
--   deliveries running at once (webhook worker + dashboard) can never send the same reply twice.
-- delivery_error: why a message could not be delivered (shown to the owner in the chat).
-- Additive only: no existing constraint or privilege changes.

alter table messages add column if not exists delivery_claimed_at timestamptz;
alter table messages add column if not exists delivery_error text;

-- Finding the messages still waiting to go out stays cheap however large the table grows.
create index if not exists messages_pending_delivery_idx
  on messages (conversation_id, created_at)
  where delivery_status = 'pending';
