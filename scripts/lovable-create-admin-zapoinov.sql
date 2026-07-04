-- ROMI-KZ · Lovable → Supabase → SQL Editor
-- Админ: zapoinov@bk.ru / zapoinov@bk.ru
-- Безопасно запускать повторно

DO $$
DECLARE
  uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = 'zapoinov@bk.ru';

  IF uid IS NULL THEN
    RAISE EXCEPTION 'Пользователь zapoinov@bk.ru не найден в auth.users. Сначала зарегистрируйтесь на сайте или создайте через Auth.';
  END IF;

  -- Подтвердить email + задать пароль
  UPDATE auth.users
  SET
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    encrypted_password = crypt('zapoinov@bk.ru', gen_salt('bf')),
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"name":"Юрий"}'::jsonb,
    updated_at = now()
  WHERE id = uid;

  -- Профиль
  INSERT INTO public.profiles (id, name, display_role)
  VALUES (uid, 'Юрий', 'admin')
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      display_role = EXCLUDED.display_role;

  -- Роль admin (убираем manager и прочие)
  DELETE FROM public.user_roles WHERE user_id = uid;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (uid, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;

-- Проверка
SELECT u.id, u.email, u.email_confirmed_at IS NOT NULL AS confirmed, r.role, p.name, p.display_role
FROM auth.users u
LEFT JOIN public.user_roles r ON r.user_id = u.id
LEFT JOIN public.profiles p ON p.id = u.id
WHERE u.email = 'zapoinov@bk.ru';
