-- ROMI-KZ · Lovable → Supabase SQL Editor
-- Fix: project deletion blocked by foreign key dependencies.
-- Safe to rerun.

-- 1) Keep explicit delete policy on projects (owner/admin, non-last logic in app).
DROP POLICY IF EXISTS "projects_delete_admin" ON public.projects;
DROP POLICY IF EXISTS projects_delete_owner ON public.projects;

CREATE POLICY projects_delete_owner ON public.projects
  FOR DELETE TO authenticated
  USING (
    COALESCE(is_primary, false) IS NOT TRUE
    AND (
      public.has_role(auth.uid(), 'admin')
      OR created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.project_members m
        WHERE m.project_id = projects.id
          AND m.user_id = auth.uid()
          AND m.role = 'owner'
      )
    )
  );

-- 2) Convert blocking FK constraints to ON DELETE CASCADE.
-- We touch only public.* constraints that reference public.projects(id)
-- and currently are NO ACTION / RESTRICT.
DO $$
DECLARE
  rec RECORD;
  ddl text;
BEGIN
  FOR rec IN
    SELECT
      c.conname,
      n.nspname AS schema_name,
      t.relname AS table_name,
      pg_get_constraintdef(c.oid) AS condef
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_class rt ON rt.oid = c.confrelid
    JOIN pg_namespace rn ON rn.oid = rt.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND rn.nspname = 'public'
      AND rt.relname = 'projects'
      AND c.confdeltype IN ('a', 'r') -- no action / restrict
  LOOP
    ddl := rec.condef;
    ddl := regexp_replace(ddl, '\s+ON\s+DELETE\s+(NO ACTION|RESTRICT)', '', 'i');
    ddl := regexp_replace(ddl, '\s+ON\s+UPDATE\s+(NO ACTION|RESTRICT)', '', 'i');
    ddl := ddl || ' ON DELETE CASCADE';

    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', rec.schema_name, rec.table_name, rec.conname);
    EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s', rec.schema_name, rec.table_name, rec.conname, ddl);
  END LOOP;
END $$;

-- 3) Diagnostics (optional):
-- SELECT conname, conrelid::regclass::text AS child_table, confdeltype
-- FROM pg_constraint c
-- JOIN pg_class p ON p.oid = c.confrelid
-- WHERE c.contype='f' AND p.relname='projects' AND c.confdeltype IN ('a','r');
