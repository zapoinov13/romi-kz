
CREATE TABLE IF NOT EXISTS public.meta_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL DEFAULT 'Meta аккаунт',
  access_token text NOT NULL,
  fb_user_id text,
  fb_user_name text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.meta_tokens TO service_role;

ALTER TABLE public.meta_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage meta_tokens"
  ON public.meta_tokens
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_meta_tokens_updated_at
  BEFORE UPDATE ON public.meta_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Перенести существующий одиночный токен, если он есть
INSERT INTO public.meta_tokens (label, access_token)
SELECT 'Основной Meta аккаунт', meta_access_token
FROM public.automation_settings
WHERE id = true
  AND meta_access_token IS NOT NULL
  AND meta_access_token <> ''
  AND NOT EXISTS (SELECT 1 FROM public.meta_tokens);
