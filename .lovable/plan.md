## Цель

Заменить текущий единый `factory-generate` на масштабируемую очередь генерации на Supabase (без n8n). 4 карточки на экране = 4 значения `content_type`, шарят один пайплайн. Стартуем с `insta-carousel`, остальные 3 включаются добавлением строк в `prompt_templates` без правки кода.

## Архитектура

```text
UI (ContentTypeGrid) ──click──> форма брифа ──POST──> clony-ingest (EF)
                                                          │
                                                          ▼
                                                  generation_jobs (queued)
                                                          │
                                            pg_cron 10s ──┼──> pg_net ──> clony-worker (EF)
                                                          │
                       ┌──────────────────────────────────┼──────────────────────────────────┐
                       │  state machine (1 step per tick) │                                   │
                       ▼                                                                      │
   queued -> routed -> generating -> qa -> (regen<=3) -> compositing -> delivering -> done    │
                                              │                                               │
                                              └─ failed (после regen лимита)                  │
                                                                                              │
                                  job_slides (idx, prompt, image_url, qa_verdict) ◄───────────┘

                          UI ◄── Supabase Realtime (generation_jobs + job_slides)
```

## Объём работ

### 1. Миграция БД (одна миграция)

- `generation_jobs` (id, content_type, status default 'queued', payload jsonb, context jsonb, slides_total int, attempts int, error, locked_at, chat_id, created_at, updated_at).
- `job_slides` (id, job_id fk on delete cascade, idx, status default 'pending', prompt, image_url, qa_verdict jsonb, attempts int).
- `prompt_templates` (content_type pk, model, system_prompt, user_prompt, options jsonb).
- GRANT для `authenticated` (read свои jobs/slides) и `service_role` (всё). RLS: пользователь видит только jobs, где `payload->>'user_id' = auth.uid()::text` (id владельца кладёт ingest). `prompt_templates` - read для authenticated, write только service_role.
- Триггер `updated_at`.
- Добавить таблицы в `supabase_realtime` publication.
- Seed: одна строка `prompt_templates` для `insta-carousel` (system+user из ТЗ карусели, что прислал ранее).
- Включить `pg_cron` и `pg_net`.

### 2. Edge Function `clony-ingest`

- POST `{ content_type, payload }`. Валидация zod: `content_type` ∈ {ad-creative, marketplace, insta-carousel, warmup}. `payload` — произвольный объект с брифом/ссылками на загруженные ассеты.
- Берёт `auth.uid()` из JWT (`verify_jwt=true`), кладёт в `payload.user_id`.
- INSERT `generation_jobs` со `status='queued'`, возвращает `{ job_id }`. Никакой генерации.

### 3. Edge Function `clony-worker`

- Вход: `{ job_id? }`. Если пусто — берёт ближайшие jobs `FOR UPDATE SKIP LOCKED LIMIT 5`, где `locked_at IS NULL OR locked_at < now()-interval '2 min'`.
- Делает **ровно один шаг** state machine на job за тик:
  - `queued -> routed`: читает `prompt_templates`, дергает Gemini 2.5 Pro (стратегия), создаёт строки `job_slides` (для carousel - 10).
  - `routed -> generating`: помечает первый pending slide, дергает `gemini-3-pro-image-preview`, пишет image_url (временно raw URL), переход не происходит пока все слайды не сгенерены.
  - `generating -> qa`: когда все slides готовы, гонит каждый через `gemini-2.5-flash` (проверка текста). При плохом QA — увеличиваем `slide.attempts`, возвращаем в `pending` (regen). Если все попытки >3 и QA плохой - помечаем как принят-с-предупреждением.
  - `qa -> compositing`: накладывает лого/лицо через Cloudinary transform, заливает финал, апдейтит `image_url`.
  - `compositing -> delivering`: если `chat_id` есть - шлём в Telegram.
  - `delivering -> done`.
- Ошибки: `attempts++`, при `attempts>=3` -> `failed` с `error`.

### 4. pg_cron + pg_net

Через `supabase--insert` (содержит project URL и anon key), не миграцию:

```sql
select cron.schedule('clony-worker-tick', '*/10 * * * * *',
  $$ select net.http_post(url:='https://<ref>.supabase.co/functions/v1/clony-worker',
       headers:='{"Content-Type":"application/json","Authorization":"Bearer <service_role>"}'::jsonb,
       body:='{}'::jsonb); $$);
```

### 5. UI

- `ContentTypeGrid` уже маршрутизирует на `CreateStep1/2/3`. Не ломаем существующий поток — добавляем **параллельный** новый submit в конце мастера: на финальном шаге вместо `factory-generate` зовём `clony-ingest`, получаем `job_id`, переходим на новую страницу `/factory/job/:id`.
- `src/pages/FactoryJob.tsx`: подписка `useRealtimeTable('generation_jobs')` + `job_slides` с фильтром по job_id, статус-бар `queued → generating → qa → done`, grid готовых картинок.

### 6. Секреты

Перед деплоем `clony-worker` запрошу через `add_secret`:
`GEMINI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, CLOUDINARY_URL, SPEECHMATICS_KEY, APIFY_TOKEN, TELEGRAM_BOT_TOKEN, SCRAPINGBEE_KEY`.
`SUPABASE_SERVICE_ROLE_KEY` на Lovable Cloud недоступен — будем подписывать pg_cron вызов anon-key + проверять секретный заголовок (`X-Worker-Secret`, заводим через add_secret как `CLONY_WORKER_SECRET`).

## Технические детали

- Edge functions: Deno, `npm:@supabase/supabase-js@2`, zod, `corsHeaders` из `npm:@supabase/supabase-js@2/cors`.
- Прогресс пишем атомарно: `UPDATE ... WHERE id=? AND status=?` (оптимистическая блокировка), `locked_at=now()` в начале шага и `NULL` в конце.
- Картинки сначала складываем в Storage bucket `clony-generations` (private, signed URLs), Cloudinary только для композитинга если потребуется.
- Старый `factory-generate` оставляем рабочим до отдельной команды на удаление.

## Открытые вопросы (до старта реализации)

1. **Старая страница финального шага**: оставить как есть и добавить кнопку «Новый пайплайн (beta)», или переключить дефолт на `clony-ingest`?
2. **Storage**: достаточно ли Supabase Storage, или ассеты обязательно через Cloudinary (CLOUDINARY_URL)?
3. **Telegram доставка**: нужна сразу для всех форматов или включаем только если `chat_id` явно пришёл в payload?
4. **Все 8 секретов сразу** или достаточно `GEMINI_API_KEY` + `CLOUDINARY_URL` для MVP `insta-carousel`?

Ответьте на 1-4 — начну с миграции.