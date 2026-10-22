-- Room lifetime: a room self-destructs after 7 days with nobody inside. Any visit resets the deadline.
-- While it is empty, the remaining time is exposed as room.expiresAt (null while someone is inside).

-- Leaving must not erase the "last seen" time: free the seat (older than the 90 s activity window) but keep it recent
create or replace function public.leave_room(p_room_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := public.require_uid();
begin
  if exists (select 1 from public.rooms where id = p_room_id and owner_id = v_uid) then
    update public.member_activity set last_active_at = least(last_active_at, now() - interval '2 minutes')
      where room_id = p_room_id and user_id = v_uid;
  else
    perform public.remove_member(p_room_id, v_uid);
  end if;
end $$;

-- Rooms whose owner left earlier carry the 1970 marker: treat their leaving as just now
update public.member_activity set last_active_at = now() - interval '2 minutes' where last_active_at < '2000-01-01';

create or replace function public.room_dto(p_room public.rooms) returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', p_room.id,
    'globalId', p_room.global_id,
    'ownerUserId', p_room.owner_id,
    'title', p_room.title,
    'visibility', p_room.visibility,
    'status', p_room.status,
    'createdAt', p_room.created_at,
    'updatedAt', p_room.updated_at,
    'participantCount', public.active_seat_count(p_room.id),
    'maxParticipants', p_room.max_participants,
    'controlMode', p_room.control_mode,
    'revision', p_room.revision,
    'expiresAt', case
      when p_room.status = 'active' and public.active_seat_count(p_room.id) = 0 then
        coalesce((select max(a.last_active_at) from public.member_activity a where a.room_id = p_room.id), p_room.created_at)
        + interval '7 days'
    end
  )
$$;

create function public.close_idle_rooms(p_ttl interval default interval '7 days') returns integer
language plpgsql security definer set search_path = public
as $$
declare v_count integer;
begin
  with closed as (
    update public.rooms r set status = 'closed', revision = r.revision + 1, updated_at = now()
    where r.status = 'active'
      and coalesce((select max(a.last_active_at) from public.member_activity a where a.room_id = r.id), r.created_at)
          < now() - p_ttl
    returning r.id
  ), cleared as (
    delete from public.chat_messages where room_id in (select id from closed)
  )
  select count(*) into v_count from closed;
  return v_count;
end $$;
revoke execute on function public.close_idle_rooms(interval) from public, anon, authenticated;

do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule('omioroom-close-inactive-rooms');
    perform cron.schedule(
      'omioroom-close-inactive-rooms',
      '* * * * *',
      $job$ select public.pause_empty_rooms(), public.close_idle_rooms(interval '7 days') $job$
    );
  end if;
exception when others then
  raise notice 'could not reschedule cron job: %', sqlerrm;
end $$;
