CREATE UNIQUE INDEX IF NOT EXISTS ad_cabinets_project_act_uniq
  ON public.ad_cabinets (project_id, ad_account_id)
  WHERE project_id IS NOT NULL AND ad_account_id IS NOT NULL AND ad_account_id <> '';