UPDATE auth.users SET email_confirmed_at = now() WHERE email = 'admin@test.local';
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE email = 'admin@test.local'
ON CONFLICT (user_id, role) DO NOTHING;