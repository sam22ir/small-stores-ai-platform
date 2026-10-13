-- Per-store reply tone: "friendly" (default, the current wording) or "formal" (polite register),
-- and whether the assistant may use one emoji per reply. The prompt reads both (agent/prompt.ts).
alter table stores add column if not exists reply_tone text not null default 'friendly'
  check (reply_tone in ('friendly', 'formal'));
alter table stores add column if not exists reply_emoji boolean not null default false;
grant update (reply_tone, reply_emoji) on stores to authenticated;
