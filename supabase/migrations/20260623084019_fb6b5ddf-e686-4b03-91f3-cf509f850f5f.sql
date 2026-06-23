
-- 1. Column-level revoke of sensitive token columns
REVOKE SELECT (bot_token) ON public.project_telegram_bots FROM anon, authenticated;
REVOKE SELECT (bot_token) ON public.project_ads_telegram_bots FROM anon, authenticated;
REVOKE SELECT (page_access_token) ON public.instagram_accounts FROM anon, authenticated;
REVOKE SELECT (api_key_encrypted) ON public.content_factory_provider_keys FROM anon, authenticated;

-- 2. prompt_templates: authenticated only
DROP POLICY IF EXISTS "read templates" ON public.prompt_templates;
CREATE POLICY "read templates" ON public.prompt_templates
  FOR SELECT TO authenticated USING (true);

-- 3. Revoke EXECUTE on internal/trigger SECURITY DEFINER functions from anon & authenticated
DO $$
DECLARE r record;
DECLARE fn_list text[] := ARRAY[
  'handle_new_user','on_lead_created','on_communication_inserted','on_deal_change',
  'on_lead_stage_change','on_lead_stage_change_attribution','on_lead_paid_change_attribution',
  'on_lead_cabinet_change_reattribute','on_diagnostic_paid_attribution','on_deal_paid_attribution',
  'on_lead_diagnostic_amount_change','trg_leads_fill_project_from_pipeline',
  'trg_leads_route_to_project_pipeline','trg_lead_capture_phone_attribution',
  'trg_lead_autofill_meta_ad_id','trg_projects_ensure_pipeline','resolve_meta_ids_from_utm',
  'update_updated_at_column','_meta_get','_get_usd_kzt_rate','ensure_cdi_row',
  '_normalize_act_id','gen_intake_token','normalize_phone','normalize_green_api_url',
  'ensure_project_pipeline','meta_structure_sync','backfill_lead_attribution',
  'reconcile_cdi_for_project','cabinet_health_check','bind_whatsapp_to_project',
  'save_whatsapp_bot_webhook','rotate_project_intake_token','get_creative_funnel'
];
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.prosecdef = true
       AND p.proname = ANY(fn_list)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;
