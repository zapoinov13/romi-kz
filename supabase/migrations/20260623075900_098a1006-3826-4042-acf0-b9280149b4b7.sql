CREATE TABLE IF NOT EXISTS public.team_member_cabinets (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cabinet_id uuid NOT NULL REFERENCES public.ad_cabinets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, cabinet_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_member_cabinets TO authenticated;
GRANT ALL ON public.team_member_cabinets TO service_role;

ALTER TABLE public.team_member_cabinets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage cabinet access"
  ON public.team_member_cabinets
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users see their own cabinet access"
  ON public.team_member_cabinets
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());