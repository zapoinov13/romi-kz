-- ROMI / MarkVision — Facebook OAuth для Meta
-- Вставить целиком в Lovable → Supabase → SQL Editor → Run
-- Безопасно запускать повторно (идемпотентно).

-- ── 1) Таблица meta_tokens (если ещё нет) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meta_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL DEFAULT 'Meta аккаунт',
  access_token text NOT NULL,
  fb_user_id text,
  fb_user_name text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- OAuth-колонки
ALTER TABLE public.meta_tokens
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS scopes text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

CREATE UNIQUE INDEX IF NOT EXISTS meta_tokens_user_fb_unique
  ON public.meta_tokens (created_by, fb_user_id)
  WHERE created_by IS NOT NULL AND fb_user_id IS NOT NULL;

-- Триггер updated_at (функция уже есть в Lovable-схеме)
DROP TRIGGER IF EXISTS update_meta_tokens_updated_at ON public.meta_tokens;
CREATE TRIGGER update_meta_tokens_updated_at
  BEFORE UPDATE ON public.meta_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT ALL ON public.meta_tokens TO service_role;

-- ── 2) Временные state для OAuth redirect ───────────────────────────────────
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

-- Edge functions пишут через service_role; клиенту таблица не нужна
REVOKE ALL ON public.meta_oauth_states FROM authenticated, anon;

-- ── 3) RLS meta_tokens ──────────────────────────────────────────────────────
ALTER TABLE public.meta_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage meta_tokens" ON public.meta_tokens;
CREATE POLICY "Admins manage meta_tokens"
  ON public.meta_tokens
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users manage own meta_tokens" ON public.meta_tokens;
CREATE POLICY "Users manage own meta_tokens"
  ON public.meta_tokens
  FOR ALL
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- ── 4) Скрыть access_token от клиента, отдать только метаданные ─────────────
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

-- ── 5) Проверка (должно вернуть строки без ошибок) ──────────────────────────
SELECT
  to_regclass('public.meta_tokens') AS meta_tokens,
  to_regclass('public.meta_oauth_states') AS meta_oauth_states;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'meta_tokens'
  AND column_name IN ('source', 'token_expires_at', 'scopes')
ORDER BY column_name;
