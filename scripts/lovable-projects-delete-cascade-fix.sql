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
-- 2a) Hard-fix leads -> projects FK first (most common blocker).
DO $$
DECLARE
  rec RECORD;
BEGIN
  -- Drop ALL FK constraints from public.leads to public.projects
  FOR rec IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_class rt ON rt.oid = c.confrelid
    JOIN pg_namespace rn ON rn.oid = rt.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND t.relname = 'leads'
      AND rn.nspname = 'public'
      AND rt.relname = 'projects'
  LOOP
    EXECUTE format('ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS %I', rec.conname);
  END LOOP;

  -- Recreate only if column exists; safe to rerun.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_project_id_fkey
      FOREIGN KEY (project_id)
      REFERENCES public.projects(id)
      ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

-- 2b) Convert remaining project FKs to ON DELETE CASCADE.
-- We touch only public.* constraints that reference public.projects(id)
-- and currently are NOT CASCADE.
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
      AND c.confdeltype <> 'c' -- not cascade
  LOOP
    ddl := rec.condef;
    ddl := regexp_replace(ddl, '\s+ON\s+DELETE\s+(NO ACTION|RESTRICT|SET NULL|SET DEFAULT|CASCADE)', '', 'i');
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
-- WHERE c.contype='f' AND p.relname='projects' AND c.confdeltype <> 'c';
