-- WhatsApp Green API: привязка к рекламному кабинету (не только к проекту).

ALTER TABLE public.whatsapp_config
  ADD COLUMN IF NOT EXISTS cabinet_id uuid REFERENCES public.ad_cabinets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_config_cabinet
  ON public.whatsapp_config(cabinet_id);

DROP INDEX IF EXISTS whatsapp_config_project_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_config_cabinet_uniq
  ON public.whatsapp_config(cabinet_id)
  WHERE cabinet_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_config_project_legacy_uniq
  ON public.whatsapp_config(project_id)
  WHERE cabinet_id IS NULL AND project_id IS NOT NULL;

DROP VIEW IF EXISTS public.whatsapp_config_safe;
CREATE VIEW public.whatsapp_config_safe
WITH (security_invoker = true) AS
SELECT
  id,
  user_id,
  project_id,
  cabinet_id,
  id_instance,
  api_url,
  phone,
  connected,
  connected_at,
  display_name,
  webhook_url,
  bot_webhook_url,
  ads_only,
  updated_at,
  api_token_present,
  webhook_token_present
FROM public.whatsapp_config;

GRANT SELECT ON public.whatsapp_config_safe TO authenticated;

DROP FUNCTION IF EXISTS public.bind_whatsapp_to_project(uuid, text);
DROP FUNCTION IF EXISTS public.bind_whatsapp_to_project(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.bind_whatsapp_to_project(
  p_project_id uuid,
  p_cabinet_id uuid,
  p_id_instance text,
  p_api_token text DEFAULT NULL,
  p_api_url text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_api_url text;
  v_cabinet_project uuid;
BEGIN
  IF p_project_id IS NULL OR p_cabinet_id IS NULL OR p_id_instance IS NULL OR btrim(p_id_instance) = '' THEN
    RAISE EXCEPTION 'project_id, cabinet_id and id_instance are required';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = p_project_id AND p.created_by = auth.uid())
    OR public.is_project_member(auth.uid(), p_project_id)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT project_id INTO v_cabinet_project
    FROM public.ad_cabinets
   WHERE id = p_cabinet_id;

  IF v_cabinet_project IS NULL OR v_cabinet_project <> p_project_id THEN
    RAISE EXCEPTION 'cabinet does not belong to this project';
  END IF;

  IF p_api_url IS NOT NULL AND btrim(p_api_url) <> '' THEN
    v_api_url := public.normalize_green_api_url(p_api_url);
  ELSE
    v_api_url := NULL;
  END IF;

  SELECT id INTO v_existing_id
    FROM public.whatsapp_config
   WHERE cabinet_id = p_cabinet_id;

  IF v_existing_id IS NULL THEN
    SELECT id INTO v_existing_id
      FROM public.whatsapp_config
     WHERE project_id = p_project_id AND cabinet_id IS NULL
     LIMIT 1;
  END IF;

  IF v_existing_id IS NULL THEN
    INSERT INTO public.whatsapp_config (
      user_id, project_id, cabinet_id, id_instance, api_token, api_url, connected
    )
    VALUES (
      auth.uid(), p_project_id, p_cabinet_id, btrim(p_id_instance),
      NULLIF(btrim(p_api_token), ''), v_api_url, false
    )
    RETURNING id INTO v_existing_id;
  ELSE
    UPDATE public.whatsapp_config
       SET project_id  = p_project_id,
           cabinet_id  = p_cabinet_id,
           id_instance = btrim(p_id_instance),
           user_id     = COALESCE(user_id, auth.uid()),
           api_token   = CASE
                           WHEN p_api_token IS NOT NULL AND btrim(p_api_token) <> ''
                           THEN btrim(p_api_token)
                           ELSE api_token
                         END,
           api_url     = COALESCE(v_api_url, api_url),
           updated_at  = now()
     WHERE id = v_existing_id;
  END IF;

  RETURN v_existing_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bind_whatsapp_to_project(uuid, uuid, text, text, text) TO authenticated;
