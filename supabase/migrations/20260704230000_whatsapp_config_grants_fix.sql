-- Re-grant safe SELECT after cabinet_id column was added (20260704220000).
SELECT public._grant_safe_select(
  'public.whatsapp_config'::regclass,
  ARRAY['api_token', 'webhook_token']
);
