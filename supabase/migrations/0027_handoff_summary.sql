-- Handoff summary: 1-2 sentences written by the agent's handoff_to_owner tool, shown to the owner in the
-- dashboard banner and in the Telegram alert.
--
-- No client grant: the dashboard reads the column but never writes it. The owner's "hand back" update
-- (status, handoff_reason) is enough, because the trigger below clears the summary whenever the chat
-- leaves 'human'. Writers that set status 'human' with a reason set handoff_summary explicitly (null or
-- the agent's summary), so a stale summary never shows next to a new reason.
alter table conversations add column if not exists handoff_summary text;

create or replace function clear_handoff_summary() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'human' and new.status is distinct from 'human' then
    new.handoff_summary := null;
  end if;
  return new;
end $$;

create or replace trigger conversations_clear_handoff_summary
  before update of status on conversations
  for each row execute function clear_handoff_summary();

-- Grants: the trigger function is not an RPC.
revoke execute on function clear_handoff_summary() from public, anon, authenticated;
