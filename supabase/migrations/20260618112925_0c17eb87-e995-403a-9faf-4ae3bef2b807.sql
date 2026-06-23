
ALTER TABLE public.ads_telegram_commands
  ADD COLUMN IF NOT EXISTS confirmation_token text,
  ADD COLUMN IF NOT EXISTS boost_payload jsonb,
  ADD COLUMN IF NOT EXISTS ig_media_id text,
  ADD COLUMN IF NOT EXISTS ig_shortcode text,
  ADD COLUMN IF NOT EXISTS ig_permalink text,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS launched_at timestamptz,
  ADD COLUMN IF NOT EXISTS launch_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ads_tg_cmd_confirmation_token
  ON public.ads_telegram_commands(confirmation_token)
  WHERE confirmation_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ads_tg_cmd_chat_pending
  ON public.ads_telegram_commands(chat_id, status)
  WHERE status = 'pending_confirmation';
