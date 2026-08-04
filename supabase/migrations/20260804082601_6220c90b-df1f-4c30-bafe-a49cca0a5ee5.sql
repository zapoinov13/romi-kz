-- meta_tokens: make ownership consistent on every write path
DROP POLICY IF EXISTS "Users update own meta_tokens" ON public.meta_tokens;
CREATE POLICY "Users update own meta_tokens"
  ON public.meta_tokens
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Users insert own meta_tokens" ON public.meta_tokens;
CREATE POLICY "Users insert own meta_tokens"
  ON public.meta_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Users delete own meta_tokens" ON public.meta_tokens;
CREATE POLICY "Users delete own meta_tokens"
  ON public.meta_tokens
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Admins delete meta_tokens" ON public.meta_tokens;
CREATE POLICY "Admins delete meta_tokens"
  ON public.meta_tokens
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- raw token column must never be readable/writable by clients
REVOKE ALL (access_token) ON public.meta_tokens FROM authenticated, anon;
REVOKE ALL (access_token) ON public.ad_cabinets FROM authenticated, anon;
REVOKE ALL (page_access_token) ON public.instagram_accounts FROM authenticated, anon;
REVOKE ALL (api_token, webhook_token) ON public.whatsapp_config FROM authenticated, anon;