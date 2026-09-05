GRANT SELECT ON public.whatsapp_accounts_safe TO authenticated;
GRANT SELECT ON public.whatsapp_accounts_safe TO service_role;
NOTIFY pgrst, 'reload schema';