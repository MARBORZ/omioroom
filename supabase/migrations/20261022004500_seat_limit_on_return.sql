-- The participant limit also applies to members coming BACK. A member whose seat lapsed (no activity for 90 s,
-- e.g. a background tab) loses it to whoever joins next; resume_room and heartbeat_room used to hand it back
-- without looking, so a room limited to 2 could end up with 3 people. The owner is never locked out of their own room.

create function public.seat_available(p_room_id uuid, p_user uuid) returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_room public.rooms;
  v_active integer;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if v_room.id is null or v_room.owner_id = p_user then
    return true;
  end if;
  -- still holding an active seat: nothing to check
  if exists (
    select 1 from public.member_activity
    where room_id = p_room_id and user_id = p_user and last_active_at > public.seat_active_cutoff()
  ) then
    return true;
  end if;
  select count(*) into v_active from public.member_activity
    where room_id = p_room_id and user_id <> p_user and last_active_at > public.seat_active_cutoff();
  return v_active < v_room.max_participants;
end $$;
revoke execute on function public.seat_available(uuid, uuid) from public, anon, authenticated;

create or replace function public.resume_room(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_room public.rooms;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if v_room.id is null then
    return jsonb_build_object('error', 'ROOM_NOT_FOUND');
  end if;
  if v_room.status <> 'active' then
    return jsonb_build_object('error', 'ROOM_CLOSED');
  end if;
  if public.is_banned(p_room_id, v_uid) then
    return jsonb_build_object('error', 'BANNED');
  end if;
  if not exists (select 1 from public.room_members where room_id = p_room_id and user_id = v_uid) then
    return jsonb_build_object('error', 'NOT_MEMBER', 'globalId', v_room.global_id, 'visibility', v_room.visibility);
  end if;
  if not public.seat_available(p_room_id, v_uid) then
    return jsonb_build_object('error', 'ROOM_FULL');
  end if;
  perform public.mark_active(p_room_id, v_uid);
  return public.build_snapshot(p_room_id, v_uid);
end $$;

create or replace function public.heartbeat_room(p_room_id uuid) returns text
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
  if public.is_banned(p_room_id, v_uid) then
    return 'BANNED';
  end if;
  if not exists (select 1 from public.room_members where room_id = p_room_id and user_id = v_uid) then
    return 'NOT_MEMBER';
  end if;
  if not public.seat_available(p_room_id, v_uid) then
    return 'ROOM_FULL';
  end if;
  perform public.mark_active(p_room_id, v_uid);
  return 'OK';
end $$;
