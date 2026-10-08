-- The dashboard's "Needs you" badge and chat list update live from conversation changes.
-- RLS still applies: members only receive changes for their own store.
alter publication supabase_realtime add table conversations;
