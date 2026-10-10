-- Security audit fixes (see docs/security-audit.md).
-- Additive: only tightens EXECUTE privileges. No table, policy or data changes.

-- touch_updated_at() is a trigger function. Nothing calls it over the API, so no API role needs EXECUTE.
-- Triggers still fire: they run as the table owner, not as the caller.
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
