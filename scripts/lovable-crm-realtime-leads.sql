-- Ensure CRM board gets live lead/message events (Lovable Supabase).
-- Run in SQL Editor if new leads only appear after F5.
-- Safe to re-run: duplicate_object is ignored.

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.communications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_status_history;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_stages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Full row on UPDATE so Realtime + RLS can filter correctly.
ALTER TABLE public.leads REPLICA IDENTITY FULL;
ALTER TABLE public.communications REPLICA IDENTITY FULL;

-- Quick check (optional):
-- SELECT tablename FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime'
--   AND tablename IN ('leads','communications');
