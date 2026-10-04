-- Which model provider answered, and why earlier ones in the fallback chain didn't.
alter table agent_runs add column provider text, add column provider_errors jsonb;
