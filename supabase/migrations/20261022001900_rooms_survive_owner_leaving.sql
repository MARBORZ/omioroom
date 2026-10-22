-- A room the owner left (without closing it) stays as it was: video, position, settings, key, chat.
--  * It is no longer closed after 5 empty minutes; it closes after 7 days without anyone inside.
--  * Playback is paused where the last person left, so coming back does not find the video "ahead".

create function public.pause_empty_rooms() returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_count integer;
  v_now bigint := public.server_time_ms();
begin
  with empty as (
    select p.room_id
    from public.playback_state p
    join public.rooms r on r.id = p.room_id and r.status = 'active'
    where p.status in ('playing', 'buffering')
      and not exists (
        select 1 from public.member_activity m
        where m.room_id = p.room_id and m.last_active_at > public.seat_active_cutoff()
      )
  ), paused as (
    update public.playback_state p set
      anchor_position = public.expected_position(p, v_now),
      anchor_server_time = v_now,
      status = 'paused',
      buffering = '{}'::jsonb,
      resume_after_buffer = false,
      revision = p.revision + 1
    where p.room_id in (select room_id from empty)
    returning 1
  )
  select count(*) into v_count from paused;
  return v_count;
end $$;
revoke execute on function public.pause_empty_rooms() from public, anon, authenticated;

do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule('omioroom-close-inactive-rooms');
    perform cron.schedule(
      'omioroom-close-inactive-rooms',
      '* * * * *',
      $job$ select public.pause_empty_rooms(), public.close_inactive_rooms(interval '7 days') $job$
    );
  end if;
exception when others then
  raise notice 'could not reschedule cron job: %', sqlerrm;
end $$;
