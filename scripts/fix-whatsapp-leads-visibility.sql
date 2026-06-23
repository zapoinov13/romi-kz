-- MarkVision mekwfbqmsqiborjdrjxc — один раз в Lovable → Supabase → SQL Editor.
-- Фикс: WhatsApp-лиды создаются (ok: true), но не видны в CRM / чатах / этапе «Новая».

-- ── A) RLS: участник проекта видит ВСЕ лиды и чаты своего project_id ──
DROP POLICY IF EXISTS leads_select_visible ON public.leads;
DROP POLICY IF EXISTS leads_update_visible ON public.leads;
DROP POLICY IF EXISTS leads_delete_visible ON public.leads;
DROP POLICY IF EXISTS comm_select_via_lead ON public.communications;

CREATE POLICY leads_select_visible ON public.leads
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      project_id IS NOT NULL
      AND public.user_can_access_project(project_id)
    )
    OR (
      project_id IS NULL
      AND (assigned_to = auth.uid() OR created_by = auth.uid())
    )
  );

CREATE POLICY leads_update_visible ON public.leads
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      project_id IS NOT NULL
      AND public.user_can_access_project(project_id)
    )
    OR (
      project_id IS NULL
      AND (assigned_to = auth.uid() OR created_by = auth.uid())
    )
  );

CREATE POLICY leads_delete_visible ON public.leads
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      project_id IS NOT NULL
      AND public.user_can_access_project(project_id)
    )
    OR (
      project_id IS NULL
      AND (assigned_to = auth.uid() OR created_by = auth.uid())
    )
  );

CREATE POLICY comm_select_via_lead ON public.communications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = communications.lead_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR (
            l.project_id IS NOT NULL
            AND public.user_can_access_project(l.project_id)
          )
          OR (
            l.project_id IS NULL
            AND (l.assigned_to = auth.uid() OR l.created_by = auth.uid())
          )
        )
    )
  );

-- ── B) Старые WhatsApp-лиды без владельца → owner проекта ──
UPDATE public.leads l
   SET created_by = COALESCE(l.created_by, p.created_by),
       assigned_to = COALESCE(l.assigned_to, p.created_by)
  FROM public.projects p
 WHERE l.project_id = p.id
   AND l.channel = 'whatsapp'
   AND (l.created_by IS NULL OR l.assigned_to IS NULL);

-- ── C) Проверка привязки инстанса (подставьте свой project_id если не тот) ──
-- UPDATE public.whatsapp_config
--    SET project_id = 'ВАШ-PROJECT-UUID'
--  WHERE id_instance = '7107618939';

NOTIFY pgrst, 'reload schema';

-- ── D) Повторная диагностика ──
SELECT id, phone, project_id, assigned_to, created_by, stage_id, created_at
  FROM public.leads
 WHERE id = '13a65fe0-0464-46b0-a043-f13510754690';

SELECT id, lead_id, direction, left(content, 80) AS preview, created_at
  FROM public.communications
 WHERE lead_id = '13a65fe0-0464-46b0-a043-f13510754690'
 ORDER BY created_at;
