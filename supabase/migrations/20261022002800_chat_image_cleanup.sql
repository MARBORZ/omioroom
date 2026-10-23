-- Chat images of closed or deleted rooms are removed by the Edge Function cleanup-chat-images (storage files
-- cannot be deleted with SQL). It runs every hour. The shared secret lives in the Vault under the name
-- 'cleanup_secret' (set once: select vault.create_secret('<secret>', 'cleanup_secret');) and as the function
-- secret CLEANUP_SECRET (supabase secrets set CLEANUP_SECRET=<secret>).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
exception when others then
  raise notice 'could not enable pg_net: %', sqlerrm;
end $$;

do $$
begin
  if to_regclass('cron.job') is not null and to_regnamespace('net') is not null then
    perform cron.schedule(
      'omioroom-cleanup-chat-images',
      '7 * * * *',
      $job$
        select net.http_post(
          url := 'https://dmpmwcxohniwfczkoxkk.supabase.co/functions/v1/cleanup-chat-images',
          headers := jsonb_build_object(
            'content-type', 'application/json',
            'x-cleanup-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_secret'), '')
          ),
          body := '{}'::jsonb
        )
      $job$
    );
  end if;
exception when others then
  raise notice 'could not schedule cron job: %', sqlerrm;
end $$;
