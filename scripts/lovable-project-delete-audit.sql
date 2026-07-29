-- Audit for "delete project removes all related data".
-- Run in Supabase SQL Editor after lovable-projects-delete-cascade-fix.sql

-- A) All FK constraints that reference public.projects and are still NOT CASCADE.
SELECT
  n.nspname AS schema_name,
  t.relname AS table_name,
  c.conname AS constraint_name,
  c.confdeltype AS delete_action_code,
  pg_get_constraintdef(c.oid) AS constraint_def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
JOIN pg_class rt ON rt.oid = c.confrelid
JOIN pg_namespace rn ON rn.oid = rt.relnamespace
WHERE c.contype = 'f'
  AND n.nspname = 'public'
  AND rn.nspname = 'public'
  AND rt.relname = 'projects'
  AND c.confdeltype <> 'c'
ORDER BY 1, 2, 3;

-- B) Columns named project_id in public schema that do NOT have FK to projects.
-- These tables may keep "related" rows unless app/trigger cleanup exists.
WITH project_cols AS (
  SELECT c.table_schema, c.table_name, c.column_name
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.column_name = 'project_id'
),
project_fk_cols AS (
  SELECT DISTINCT
    n.nspname AS table_schema,
    t.relname AS table_name,
    a.attname AS column_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  JOIN pg_class rt ON rt.oid = c.confrelid
  JOIN pg_namespace rn ON rn.oid = rt.relnamespace
  JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
  WHERE c.contype = 'f'
    AND n.nspname = 'public'
    AND rn.nspname = 'public'
    AND rt.relname = 'projects'
)
SELECT pc.table_schema, pc.table_name, pc.column_name
FROM project_cols pc
LEFT JOIN project_fk_cols fk
  ON fk.table_schema = pc.table_schema
 AND fk.table_name = pc.table_name
 AND fk.column_name = pc.column_name
WHERE fk.table_name IS NULL
ORDER BY pc.table_name;
