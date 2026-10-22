-- Heartbeat that answers: the client learns within one beat that the room closed or that its seat was lost
-- (cheaper than a full snapshot). Plus housekeeping so tables and indexes stay small.

create function public.heartbeat_room(p_room_id uuid) returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_status text;
begin
  select status into v_status from public.rooms where id = p_room_id;
  if v_status is null then
    return 'ROOM_NOT_FOUND';
  end if;
  if v_status <> 'active' then
    return 'ROOM_CLOSED';
  end if;
  if exists (select 1 from public.room_bans where room_id = p_room_id and user_id = v_uid) then
    return 'BANNED';
  end if;
  if not exists (select 1 from public.room_members where room_id = p_room_id and user_id = v_uid) then
    return 'NOT_MEMBER';
  end if;
  perform public.mark_active(p_room_id, v_uid);
  return 'OK';
end $$;
revoke execute on function public.heartbeat_room(uuid) from public, anon;
grant execute on function public.heartbeat_room(uuid) to authenticated;

-- Seat counting and the offline sweep look rows up by activity time
create index if not exists member_activity_room_active_idx on public.member_activity (room_id, last_active_at desc);

-- Closed rooms are kept for a few days (so "this room was closed" can still be answered), then removed with everything attached
create function public.purge_closed_rooms(p_keep interval default interval '3 days') returns integer
language plpgsql security definer set search_path = public
as $$
declare v_count integer;
begin
  with gone as (
    delete from public.rooms where status = 'closed' and updated_at < now() - p_keep returning id
  )
  select count(*) into v_count from gone;
  -- Leftovers of the throttling / idempotency tables
  delete from public.rate_events where at < now() - interval '1 hour';
  delete from public.idempotency_keys where created_at < now() - interval '1 day';
  delete from public.processed_commands where created_at < now() - interval '1 day';
  return v_count;
end $$;
revoke execute on function public.purge_closed_rooms(interval) from public, anon, authenticated;

do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.schedule('omioroom-purge-closed-rooms', '17 3 * * *', $job$ select public.purge_closed_rooms(interval '3 days') $job$);
  end if;
exception when others then
  raise notice 'could not schedule cron job: %', sqlerrm;
end $$;
