-- Closes rooms nobody touched for 30 minutes (and drops their chat), every 10 minutes.
-- pg_cron is available on Supabase (enable it under Database > Extensions if the call below is skipped).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'omioroom-close-inactive-rooms',
      '*/10 * * * *',
      $job$ select public.close_inactive_rooms(interval '30 minutes') $job$
    );
  else
    raise notice 'pg_cron not available: schedule public.close_inactive_rooms() yourself';
  end if;
end $$;
