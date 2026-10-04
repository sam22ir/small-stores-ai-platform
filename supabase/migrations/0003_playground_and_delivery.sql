-- Playground channel: lets us test the agent end to end without Meta.
alter table channels drop constraint channels_platform_check;
alter table channels add constraint channels_platform_check
  check (platform in ('facebook', 'instagram', 'playground'));

-- Delivery state of outbound messages (null for inbound).
alter table messages add column delivery_status text
  check (delivery_status in ('pending', 'sent', 'failed', 'skipped'));
