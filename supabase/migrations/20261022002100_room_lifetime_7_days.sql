-- A room lives for 7 days from its creation, or until the owner closes it earlier. Leaving does not end it.
create function public.close_expired_rooms(p_ttl interval default interval '7 days') returns integer
language plpgsql security definer set search_path = public
as $$
declare v_count integer;
begin
  with closed as (
    update public.rooms set status = 'closed', revision = revision + 1, updated_at = now()
    where status = 'active' and created_at < now() - p_ttl
    returning id
  ), cleared as (
    delete from public.chat_messages where room_id in (select id from closed)
  )
  select count(*) into v_count from closed;
  return v_count;
end $$;
revoke execute on function public.close_expired_rooms(interval) from public, anon, authenticated;

do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule('omioroom-close-inactive-rooms');
    perform cron.schedule(
      'omioroom-close-inactive-rooms',
      '* * * * *',
      $job$ select public.pause_empty_rooms(), public.close_expired_rooms(interval '7 days') $job$
    );
  end if;
exception when others then
  raise notice 'could not reschedule cron job: %', sqlerrm;
end $$;
