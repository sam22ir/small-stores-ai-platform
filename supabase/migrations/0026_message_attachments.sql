-- Photos customers send in Instagram/Facebook DMs. Each entry is {"type": "image", "url": "<Meta CDN link>"}.
-- The links expire; they are kept only so the reply can fetch the photo (see _shared/meta/media.ts).
-- Additive: messages gains one nullable column. RLS and grants are unchanged (table-level select exists;
-- the dashboard selects explicit columns).
alter table public.messages add column if not exists attachments jsonb;
