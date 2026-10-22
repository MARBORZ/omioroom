-- Coming back to a room the client remembers (page reload, reopened tab).
-- The answer tells the three failure cases apart, so the UI can say what happened:
--   ROOM_NOT_FOUND  the room does not exist (any more)
--   ROOM_CLOSED     the owner closed it, or it expired while empty
--   NOT_MEMBER      the room lives, but this user is no longer in it (left, kicked, dropped after 5 offline minutes)
create function public.resume_room(p_room_id uuid) returns jsonb
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
  if exists (select 1 from public.room_bans where room_id = p_room_id and user_id = v_uid) then
    return jsonb_build_object('error', 'BANNED');
  end if;
  if not exists (select 1 from public.room_members where room_id = p_room_id and user_id = v_uid) then
    return jsonb_build_object('error', 'NOT_MEMBER', 'globalId', v_room.global_id, 'visibility', v_room.visibility);
  end if;
  perform public.mark_active(p_room_id, v_uid);
  return public.build_snapshot(p_room_id, v_uid);
end $$;

revoke execute on function public.resume_room(uuid) from public, anon;
grant execute on function public.resume_room(uuid) to authenticated;
