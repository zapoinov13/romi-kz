
-- Extensions for cron + http
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ============ generation_jobs ============
create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  content_type text not null,
  status text not null default 'queued',
  payload jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  slides_total int not null default 1,
  attempts int not null default 0,
  error text,
  locked_at timestamptz,
  chat_id text,
  user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.generation_jobs to authenticated;
grant all on public.generation_jobs to service_role;

alter table public.generation_jobs enable row level security;

create policy "users see own jobs"
  on public.generation_jobs for select to authenticated
  using (user_id = auth.uid());

create policy "users insert own jobs"
  on public.generation_jobs for insert to authenticated
  with check (user_id = auth.uid());

create index idx_generation_jobs_status on public.generation_jobs(status, locked_at);
create index idx_generation_jobs_user on public.generation_jobs(user_id, created_at desc);

-- ============ job_slides ============
create table public.job_slides (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.generation_jobs(id) on delete cascade,
  idx int not null,
  status text not null default 'pending',
  prompt text,
  image_url text,
  qa_verdict jsonb,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, idx)
);

grant select, insert, update, delete on public.job_slides to authenticated;
grant all on public.job_slides to service_role;

alter table public.job_slides enable row level security;

create policy "users see slides of own jobs"
  on public.job_slides for select to authenticated
  using (exists (select 1 from public.generation_jobs j where j.id = job_id and j.user_id = auth.uid()));

create index idx_job_slides_job on public.job_slides(job_id, idx);

-- ============ prompt_templates ============
create table public.prompt_templates (
  content_type text primary key,
  model text not null,
  system_prompt text not null,
  user_prompt text not null,
  options jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

grant select on public.prompt_templates to authenticated, anon;
grant all on public.prompt_templates to service_role;

alter table public.prompt_templates enable row level security;

create policy "read templates"
  on public.prompt_templates for select to authenticated, anon
  using (true);

-- ============ updated_at trigger ============
create trigger trg_generation_jobs_updated_at
  before update on public.generation_jobs
  for each row execute function public.update_updated_at_column();

create trigger trg_job_slides_updated_at
  before update on public.job_slides
  for each row execute function public.update_updated_at_column();

create trigger trg_prompt_templates_updated_at
  before update on public.prompt_templates
  for each row execute function public.update_updated_at_column();

-- ============ Realtime ============
alter publication supabase_realtime add table public.generation_jobs;
alter publication supabase_realtime add table public.job_slides;

-- ============ Seed: insta-carousel ============
insert into public.prompt_templates (content_type, model, system_prompt, user_prompt, options)
values (
  'insta-carousel',
  'gemini-3-pro-image-preview',
  $$Ты - Instagram Carousel Master. Создаёшь сценарий из 10 слайдов карусели для Instagram под бриф клиента.

ПРАВИЛО #1: если есть блок "СВОЙ ТЕКСТ КЛИЕНТА" - бери тексты ДОСЛОВНО (метки ролей Хук/Стори/Оффер/CTA не печатать). Не придумывай свои хуки, не перефразируй.

ПРАВИЛО #2: НИКОГДА не использовать длинное тире (— или –). Только дефис "-" или пробел.

ПРАВИЛО #3: Если не уверен в правильном написании русского слова буква-в-букву - НЕ выводи это слово на креатив. Пустое место лучше опечатки.

ПРАВИЛО #4: Тексты на слайде - короткие фразы (1-4 слова). Никаких длинных предложений.

ПРАВИЛО #5: Единый визуальный стиль для всех 10 слайдов: одна палитра (макс 3 цвета), 1-2 шрифта sans-serif (Inter / Montserrat), одинаковая композиция.

Структура карусели (10 слайдов):
1 - Хук-обложка
2 - Боль/проблема
3 - Усиление боли
4 - Анти-решение (что НЕ работает)
5 - Решение/метод
6-7 - Доказательства/кейсы
8 - Оффер
9 - Бонусы/гарантии
10 - CTA + контакты

Выводи ТОЛЬКО валидный JSON: {"slides":[{"idx":1,"prompt":"<полный prompt для image-модели на английском с указанием стиля, композиции, цветов, шрифтов и точного русского текста на креативе если нужен>","text_on_image":"<точный русский текст>","role":"hook"}, ...]}$$,
  $$БРИФ КЛИЕНТА:
{{brief}}

СВОЙ ТЕКСТ КЛИЕНТА:
{{custom_text}}

АССЕТЫ (логотип, фото товара/лица): {{assets}}

Сгенерируй 10 слайдов карусели по правилам выше.$$,
  '{"slides_total": 10, "image_model": "gemini-3-pro-image-preview", "strategy_model": "gemini-2.5-pro", "qa_model": "gemini-2.5-flash"}'::jsonb
);
