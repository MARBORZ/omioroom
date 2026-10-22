-- Buffering follows the LEADER: the device that issued the last playback command (the owner if
-- nobody has yet). A stall on the leader's device holds the room and its reported position becomes
-- the room's position; stalls on followers never stop anyone: they catch up on their own.
-- The wait for a stalled leader is 10 s.

create function public.buffer_wait_ms() returns bigint
language sql immutable set search_path = public
as $$ select 10000::bigint $$;
revoke execute on function public.buffer_wait_ms() from public, anon, authenticated;

-- Who the room follows. Falls back from the last actor to the owner when the actor is away.
create function public.room_leader(p_room_id uuid) returns uuid
language sql stable security definer set search_path = public
as $$
  select case
    when p.updated_by is not null and exists (
      select 1 from public.member_activity m
      where m.room_id = p_room_id and m.user_id = p.updated_by and m.last_active_at > public.seat_active_cutoff()
    ) then p.updated_by
    when exists (
      select 1 from public.member_activity m
      where m.room_id = p_room_id and m.user_id = r.owner_id and m.last_active_at > public.seat_active_cutoff()
    ) then r.owner_id
    else null
  end
  from public.rooms r
  join public.playback_state p on p.room_id = r.id
  where r.id = p_room_id
$$;
revoke execute on function public.room_leader(uuid) from public, anon, authenticated;

create or replace function public.try_resume_after_buffer(p_state public.playback_state, p_now bigint)
returns public.playback_state
language plpgsql security definer set search_path = public
as $$
declare
  v_fresh boolean;
  v_out public.playback_state;
begin
  select exists (
    select 1 from jsonb_each_text(p_state.buffering) e where e.value::bigint > p_now - public.buffer_wait_ms()
  ) into v_fresh;

  if p_state.status = 'buffering' and p_state.resume_after_buffer and not v_fresh then
    update public.playback_state set
      status = 'playing',
      anchor_server_time = p_now + 400,
      buffering = '{}'::jsonb,
      resume_after_buffer = false,
      revision = revision + 1
    where room_id = p_state.room_id
    returning * into v_out;
    return v_out;
  end if;
  return p_state;
end $$;

create or replace function public.report_buffering(
  p_room_id uuid,
  p_is_buffering boolean,
  p_position double precision default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_state public.playback_state;
  v_now bigint;
  v_leader uuid;
  v_expected double precision;
  v_pos double precision;
begin
  perform public.assert_active_member(p_room_id, v_uid);
  select * into v_state from public.playback_state where room_id = p_room_id for update;
  if v_state.room_id is null then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  perform public.mark_active(p_room_id, v_uid);
  v_now := public.server_time_ms();
  v_leader := public.room_leader(p_room_id);

  if coalesce(p_is_buffering, false) then
    -- A follower's stall is its own business: it catches up by itself. Only the leader holds the room.
    if v_leader is not null and v_leader <> v_uid then
      return public.playback_dto(v_state);
    end if;
    if v_state.status not in ('playing', 'buffering') then
      return public.playback_dto(v_state);
    end if;

    v_expected := public.expected_position(v_state, v_now);
    -- The leader's own player position is the room's position; distrust implausible values
    v_pos := case
      when p_position is null then v_expected
      else least(greatest(p_position, v_expected - 10), v_expected + 10)
    end;
    v_pos := greatest(v_pos, 0);

    update public.playback_state set
      buffering = buffering || jsonb_build_object(v_uid::text, v_now),
      anchor_position = case when status = 'playing' then v_pos else anchor_position end,
      anchor_server_time = case when status = 'playing' then v_now else anchor_server_time end,
      resume_after_buffer = true,
      status = 'buffering',
      revision = revision + 1
    where room_id = p_room_id
    returning * into v_state;
  else
    if not (v_state.buffering ? v_uid::text) then
      return public.playback_dto(v_state);
    end if;
    update public.playback_state set
      buffering = buffering - v_uid::text,
      revision = revision + 1
    where room_id = p_room_id
    returning * into v_state;
    v_state := public.try_resume_after_buffer(v_state, v_now);
  end if;
  return public.playback_dto(v_state);
end $$;

create or replace function public.resolve_buffering(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_state public.playback_state;
  v_now bigint;
begin
  perform public.assert_active_member(p_room_id, v_uid);
  select * into v_state from public.playback_state where room_id = p_room_id for update;
  if v_state.room_id is null or v_state.status <> 'buffering' then
    return case when v_state.room_id is null then null else public.playback_dto(v_state) end;
  end if;

  v_now := public.server_time_ms();
  update public.playback_state set
    buffering = coalesce((
      select jsonb_object_agg(e.key, e.value::bigint)
      from jsonb_each_text(buffering) e where e.value::bigint > v_now - public.buffer_wait_ms()
    ), '{}'::jsonb),
    revision = revision + 1
  where room_id = p_room_id
  returning * into v_state;
  v_state := public.try_resume_after_buffer(v_state, v_now);
  return public.playback_dto(v_state);
end $$;

revoke execute on function public.try_resume_after_buffer(public.playback_state, bigint) from public, anon, authenticated;
revoke execute on function public.report_buffering(uuid, boolean, double precision) from public, anon;
revoke execute on function public.resolve_buffering(uuid) from public, anon;
grant execute on function public.report_buffering(uuid, boolean, double precision) to authenticated;
grant execute on function public.resolve_buffering(uuid) to authenticated;
