
CREATE POLICY "ads_tg_media_service_all"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'ads-telegram-media')
  WITH CHECK (bucket_id = 'ads-telegram-media');

CREATE POLICY "ads_tg_media_members_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'ads-telegram-media');
