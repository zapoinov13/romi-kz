
## Что делаем

Две связанные фичи:

1. В Настройках — отдельная вкладка «OpenAI», где можно вставить токен, проверить его (валиден/невалиден, баланс/модель) и увидеть, для чего он используется.
2. В диалоге запуска рекламы (`CreateCampaignDialog`) — кнопка «Сгенерировать тексты по креативу». Берёт уже загруженное видео/изображение, отправляет в GPT-4o Vision (или для видео — извлекаем кадры), получает обратно заголовок (до 40), основной текст (до 500), описание ссылки (до 30) и предлагаемый CTA. Пользователь может одним кликом подставить или отредактировать.

---

## 1. Настройки → вкладка «OpenAI»

Файл: `src/pages/Settings.tsx` — добавить таб `openai` рядом с `team / meta / telegram-ads`.

Новый компонент `src/components/settings/OpenAiKeySettings.tsx`:
- Поле «API-ключ» (password input, маска `sk-...****1234`).
- Кнопка «Сохранить и проверить» — вызывает edge-функцию `openai-key-check`.
- Бейджи статуса: «Работает / Ошибка / Не проверен», модель по умолчанию (gpt-4o-mini для Vision), дата последней проверки.
- Блок-подсказка «Для чего используется»:
  - Авто-генерация заголовка, текста и описания рекламы по загруженному фото/видео.
  - В будущем — анализ комментариев, расшифровка звонков и т.д. (только описание, без реализации сейчас).
- Кнопка «Удалить ключ».

### Хранение токена

Ключ хранится в БД, шифруется через тот же подход, что и `content_factory_provider_keys` (есть проверенный паттерн в проекте). Делаем НЕ через project-secret, а через таблицу — потому что ключ привязан к проекту, и нужны статус/баланс/last_checked_at.

Миграция: новая таблица `project_openai_keys`
```
id uuid pk, project_id uuid fk projects, key_ciphertext text, key_hint text,
status text ('ok'|'error'|'unknown'), last_checked_at timestamptz,
last_error text, model_default text default 'gpt-4o-mini',
created_at, updated_at
```
RLS: чтение/запись — только участники проекта (`is_project_member(project_id)`), `GRANT` для `authenticated` + `service_role`. Сам `key_ciphertext` НЕ отдаём в API — выбираем только `key_hint, status, last_checked_at, last_error, model_default` через view `project_openai_keys_public` либо через REVOKE на колонку (как сделано с токенами в недавнем security-фиксе).

### Edge-функции

- `openai-key-save` — принимает `{ project_id, api_key }`, шифрует, делает тест-запрос `GET https://api.openai.com/v1/models`, сохраняет статус.
- `openai-key-check` — перепроверяет уже сохранённый ключ.
- `openai-key-delete` — удаляет.
- `ads-generate-copy` — основная функция для фичи №2 (см. ниже).

Все вызовы OpenAI идут ТОЛЬКО из edge-функций. Ключ в браузер не уходит никогда.

---

## 2. Авто-генерация текстов в `CreateCampaignDialog`

Файл: `src/components/ads/CreateCampaignDialog.tsx` (блок «Тексты и нейминг», строки ~1320-1395).

Добавляем над полем «Заголовок» кнопку-карточку:
```
[✨ Сгенерировать тексты по креативу]
```
Состояния: idle / analyzing («Анализирую видео…») / done / error.

### Логика

1. Берём текущий выбранный медиа-ассет креатива (там уже есть видео или картинка — у компонента есть `mediaUrl/videoUrl/imageUrl`, нужно найти точное имя при имплементации).
2. POST в edge-функцию `ads-generate-copy`:
   ```
   { project_id, cabinet_id, media_url, media_type: 'image'|'video',
     goal, cta, brand_hint?: string }
   ```
3. Edge-функция:
   - Достаёт ключ OpenAI проекта (расшифровывает).
   - Если `image` — отправляет URL в `gpt-4o-mini` через `chat.completions` с `image_url` content-блоком.
   - Если `video` — через `ffmpeg` (есть в окружении edge? — если нет, fallback: берём только обложку/poster. Альтернатива: загружаем видео в Lovable AI Gateway Gemini, который поддерживает видео нативно). В плане: **по умолчанию для видео используем Gemini (Lovable AI), для фото — OpenAI Vision (ключ пользователя)**. Это снимает проблему с обработкой видео и оставляет OpenAI там, где пользователь явно хотел.
   - Промпт: «Опиши, что на креативе. Сгенерируй для рекламы Meta Ads на цель {goal}: заголовок ≤40, текст ≤500, описание ≤30. Верни JSON».
   - Возвращает `{ headline, primary_text, description, suggested_cta }`.
4. UI подставляет поля. Каждое поле остаётся редактируемым. Тост «Готово, проверьте и поправьте».

### Edge-функция кода

`supabase/functions/ads-generate-copy/index.ts`:
- CORS, валидация Zod.
- Проверка прав через JWT → `is_project_member`.
- Расшифровка ключа.
- Вызов OpenAI / Lovable AI.
- Лимит длины, обрезка.

---

## Технические детали

- Шифрование ключа: переиспользуем helper из `_shared/` (тот же, что у `content_factory_provider_keys`), чтобы не плодить схемы.
- Все edge-функции с `verify_jwt = true` (дефолт) — нужен авторизованный пользователь.
- Никаких ключей OpenAI в `.env` проекта — каждый клиент вводит свой.
- На фронте использовать существующий паттерн `useContentFactoryProviders` как образец для нового хука `useOpenAiKey(projectId)`.
- Security: `key_ciphertext` колонку — `REVOKE SELECT ... FROM authenticated, anon`, выдать только `service_role`. Клиент читает только безопасные поля.

---

## Что меняется по файлам

- `supabase/migrations/<new>.sql` — таблица `project_openai_keys` + RLS + GRANT + REVOKE на ciphertext.
- `supabase/functions/openai-key-save/index.ts` — новая.
- `supabase/functions/openai-key-check/index.ts` — новая.
- `supabase/functions/openai-key-delete/index.ts` — новая.
- `supabase/functions/ads-generate-copy/index.ts` — новая.
- `src/components/settings/OpenAiKeySettings.tsx` — новый компонент.
- `src/hooks/useOpenAiKey.ts` — новый хук.
- `src/pages/Settings.tsx` — добавить таб OpenAI.
- `src/components/ads/CreateCampaignDialog.tsx` — кнопка «Сгенерировать тексты», обработчик, состояния.

---

## Открытые вопросы (нужны ответы перед сборкой)

1. **Видео**: ок ли, что для видео мы используем Lovable AI Gemini (бесплатно для тебя, нативная поддержка видео), а OpenAI ключ — только для фото? Или строго всё через OpenAI (тогда для видео берём только poster-кадр, качество анализа хуже)?
2. **Язык генерации**: всегда русский, или брать язык из настроек проекта / выбранной аудитории?
3. **Тон/стиль**: подтягивать из бренд-брифа проекта (если есть в `project_briefs`), или сейчас просто «продающий, короткий»?
4. **CTA**: GPT может предложить новый CTA, но в Meta доступен ограниченный список (`CTA_BY_GOAL`). Подставлять ближайший из разрешённых — ок?
