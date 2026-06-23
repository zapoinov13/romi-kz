-- ============= Provider keys (per project) =============
CREATE TABLE public.content_factory_provider_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('kie_ai','gemini','openai')),
  api_key_encrypted text NOT NULL,
  key_hint text,                -- last 4 chars for masked display
  priority int NOT NULL DEFAULT 100,
  is_enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown','ok','error','quota')),
  last_checked_at timestamptz,
  last_error text,
  balance_info jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, provider)
);

-- Only authenticated users can read metadata; api_key_encrypted handled via column-level grant.
GRANT SELECT (id, project_id, provider, key_hint, priority, is_enabled, status,
              last_checked_at, last_error, balance_info, created_by, created_at, updated_at)
  ON public.content_factory_provider_keys TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.content_factory_provider_keys TO authenticated;
GRANT ALL ON public.content_factory_provider_keys TO service_role;

ALTER TABLE public.content_factory_provider_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read provider keys"
  ON public.content_factory_provider_keys FOR SELECT TO authenticated
  USING (public.user_can_access_project(project_id));
CREATE POLICY "members write provider keys"
  ON public.content_factory_provider_keys FOR ALL TO authenticated
  USING (public.user_can_access_project(project_id))
  WITH CHECK (public.user_can_access_project(project_id));

CREATE TRIGGER trg_cfpk_updated
  BEFORE UPDATE ON public.content_factory_provider_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= Briefs (TZ per content type, per project) =============
CREATE TABLE public.content_factory_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN
    ('facebook-ads','marketplace','insta-carousel','stories','warmup')),
  system_prompt text NOT NULL DEFAULT '',
  style_notes text,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, content_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_factory_briefs TO authenticated;
GRANT ALL ON public.content_factory_briefs TO service_role;
ALTER TABLE public.content_factory_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read briefs"
  ON public.content_factory_briefs FOR SELECT TO authenticated
  USING (public.user_can_access_project(project_id));
CREATE POLICY "members write briefs"
  ON public.content_factory_briefs FOR ALL TO authenticated
  USING (public.user_can_access_project(project_id))
  WITH CHECK (public.user_can_access_project(project_id));

CREATE TRIGGER trg_cfb_updated
  BEFORE UPDATE ON public.content_factory_briefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= Generations log =============
CREATE TABLE public.content_factory_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  request_id text,
  content_type text,
  provider_used text,           -- kie_ai | gemini | openai | lovable_gateway
  model text,
  prompt_snapshot text,
  input_payload jsonb,
  result_urls jsonb,
  tokens_spent numeric,
  cost_cents numeric,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success','error','partial')),
  error text,
  attempts jsonb,               -- per-provider attempt trace
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.content_factory_generations TO authenticated;
GRANT ALL ON public.content_factory_generations TO service_role;
ALTER TABLE public.content_factory_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read generations"
  ON public.content_factory_generations FOR SELECT TO authenticated
  USING (public.user_can_access_project(project_id));
CREATE POLICY "service writes generations"
  ON public.content_factory_generations FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_project(project_id));

CREATE INDEX idx_cfg_project_created ON public.content_factory_generations(project_id, created_at DESC);