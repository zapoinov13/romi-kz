CREATE TABLE public.cabinet_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid NOT NULL REFERENCES public.ad_cabinets(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  greeting text NOT NULL DEFAULT '',
  ice_breakers jsonb NOT NULL DEFAULT '[]'::jsonb,
  cta_label text,
  cta_payload text,
  is_default boolean NOT NULL DEFAULT false,
  meta_sync_status text NOT NULL DEFAULT 'local',
  meta_synced_at timestamptz,
  meta_last_error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cabinet_message_templates_cabinet_idx
  ON public.cabinet_message_templates (cabinet_id, created_at DESC);
CREATE INDEX cabinet_message_templates_project_idx
  ON public.cabinet_message_templates (project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cabinet_message_templates TO authenticated;
GRANT ALL ON public.cabinet_message_templates TO service_role;

ALTER TABLE public.cabinet_message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view cabinet message templates"
  ON public.cabinet_message_templates FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.user_can_access_project(project_id)
  );

CREATE POLICY "Project members can insert cabinet message templates"
  ON public.cabinet_message_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.user_can_access_project(project_id)
  );

CREATE POLICY "Project members can update cabinet message templates"
  ON public.cabinet_message_templates FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.user_can_access_project(project_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.user_can_access_project(project_id)
  );

CREATE POLICY "Project members can delete cabinet message templates"
  ON public.cabinet_message_templates FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.user_can_access_project(project_id)
  );

CREATE TRIGGER cabinet_message_templates_set_updated_at
  BEFORE UPDATE ON public.cabinet_message_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Гарантируем что только один шаблон у кабинета помечен как default
CREATE UNIQUE INDEX cabinet_message_templates_one_default_per_cabinet
  ON public.cabinet_message_templates (cabinet_id)
  WHERE is_default = true;