-- Fix room mutes in 'everyone' mode:
-- In 'everyone' mode, ordinary participants can control playback, but they are not controllers.
-- The owner (and appointed controllers) must be able to mute ordinary members in 'everyone' mode.

create or replace function public.set_member_muted(p_room_id uuid, p_user_id uuid, p_muted boolean) returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := public.require_uid();
begin
  perform public.assert_active_member(p_room_id, v_uid);
  -- Only the owner or members explicitly granted control may mute others
  if not exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = v_uid and (role = 'owner' or can_control = true)
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if p_user_id is null or p_user_id = v_uid
     or not exists (select 1 from public.room_members where room_id = p_room_id and user_id = p_user_id) then
    raise exception 'INVALID_PAYLOAD';
  end if;

  if coalesce(p_muted, false) then
    -- The owner and members explicitly granted control cannot be muted
    if exists (
      select 1 from public.room_members
      where room_id = p_room_id and user_id = p_user_id and (role = 'owner' or can_control = true)
    ) then
      raise exception 'FORBIDDEN';
    end if;
    insert into public.room_mutes (room_id, user_id, muted_by) values (p_room_id, p_user_id, v_uid)
      on conflict (room_id, user_id) do nothing;
  else
    delete from public.room_mutes where room_id = p_room_id and user_id = p_user_id;
  end if;
end $$;

revoke execute on function public.set_member_muted(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_member_muted(uuid, uuid, boolean) to authenticated;
