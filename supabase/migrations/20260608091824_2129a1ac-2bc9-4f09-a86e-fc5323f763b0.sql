
-- 1. projects: SELECT policy → authenticated
DROP POLICY IF EXISTS projects_select_owner_admin ON public.projects;
CREATE POLICY projects_select_owner_admin ON public.projects
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR created_by = auth.uid()
    OR is_project_member(auth.uid(), id)
  );

-- 2. instagram_accounts: SELECT policy → authenticated
DROP POLICY IF EXISTS ig_accounts_select ON public.instagram_accounts;
CREATE POLICY ig_accounts_select ON public.instagram_accounts
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = instagram_accounts.project_id AND p.created_by = auth.uid()
    )
  );

-- 3. phone_attribution: SELECT policy → authenticated
DROP POLICY IF EXISTS phone_attr_select ON public.phone_attribution;
CREATE POLICY phone_attr_select ON public.phone_attribution
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (project_id IS NOT NULL AND user_can_access_project(project_id))
  );

-- 4. whatsapp_config: tighten SELECT to admin/owner only.
-- Other project members must use whatsapp_config_safe view.
DROP POLICY IF EXISTS wa_select ON public.whatsapp_config;
CREATE POLICY wa_select ON public.whatsapp_config
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR user_id = auth.uid()
  );

-- 5. AI ROP tables: change all policies from {public} to {authenticated}
DO $$
DECLARE
  r record;
  v_cmd text;
  v_using text;
  v_check text;
  v_for text;
BEGIN
  FOR r IN
    SELECT n.nspname, c.relname, p.polname, p.polcmd,
           pg_get_expr(p.polqual, p.polrelid) AS using_expr,
           pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname LIKE 'ai_rop_%'
      AND p.polroles = ARRAY[0]::oid[]  -- {public}
  LOOP
    v_for := CASE r.polcmd
      WHEN 'r' THEN 'SELECT'
      WHEN 'a' THEN 'INSERT'
      WHEN 'w' THEN 'UPDATE'
      WHEN 'd' THEN 'DELETE'
      WHEN '*' THEN 'ALL'
    END;
    EXECUTE format('DROP POLICY %I ON %I.%I', r.polname, r.nspname, r.relname);
    IF v_for = 'INSERT' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR INSERT TO authenticated WITH CHECK (%s)',
        r.polname, r.nspname, r.relname, COALESCE(r.check_expr, 'true')
      );
    ELSIF v_for IN ('UPDATE','ALL') THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR %s TO authenticated USING (%s) WITH CHECK (%s)',
        r.polname, r.nspname, r.relname, v_for,
        COALESCE(r.using_expr, 'true'),
        COALESCE(r.check_expr, r.using_expr, 'true')
      );
    ELSE
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR %s TO authenticated USING (%s)',
        r.polname, r.nspname, r.relname, v_for,
        COALESCE(r.using_expr, 'true')
      );
    END IF;
  END LOOP;
END $$;
