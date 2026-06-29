-- Facebook OAuth: state storage + token metadata (идемпотентно для Lovable SQL Editor)

ALTER TABLE public.meta_tokens
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS scopes text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

CREATE UNIQUE INDEX IF NOT EXISTS meta_tokens_user_fb_unique
  ON public.meta_tokens (created_by, fb_user_id)
  WHERE created_by IS NOT NULL AND fb_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.meta_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  return_to text,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

ALTER TABLE public.meta_oauth_states ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.meta_oauth_states TO service_role;
REVOKE ALL ON public.meta_oauth_states FROM authenticated, anon;

DROP POLICY IF EXISTS "Users manage own meta_tokens" ON public.meta_tokens;
CREATE POLICY "Users manage own meta_tokens"
  ON public.meta_tokens
  FOR ALL
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

REVOKE SELECT ON public.meta_tokens FROM authenticated, anon;
GRANT SELECT (
  id,
  label,
  fb_user_id,
  fb_user_name,
  created_by,
  created_at,
  updated_at,
  token_expires_at,
  scopes,
  source
) ON public.meta_tokens TO authenticated;
