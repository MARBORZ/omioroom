-- Group buffering barrier: when someone's player stalls, the room waits (up to 5 s), then resumes together.

alter table public.playback_state
  add column buffering jsonb not null default '{}'::jsonb,           -- { userId: epoch ms when their stall started }
  add column resume_after_buffer boolean not null default false;     -- the room was playing before the stall

create or replace function public.playback_dto(p_state public.playback_state) returns jsonb
language sql stable set search_path = public
as $$
  select jsonb_build_object(
    'roomId', p_state.room_id,
    'media', p_state.media,
    'status', p_state.status,
    'anchorPosition', p_state.anchor_position,
    'anchorServerTime', p_state.anchor_server_time,
    'playbackRate', p_state.playback_rate,
    'revision', p_state.revision,
    'updatedByUserId', p_state.updated_by,
    'bufferingBy', coalesce((select jsonb_agg(k) from jsonb_object_keys(p_state.buffering) as k), '[]'::jsonb)
  )
$$;

-- Shared by report/resolve: resume playback once no fresh stall is left.
create function public.try_resume_after_buffer(p_state public.playback_state, p_now bigint)
returns public.playback_state
language plpgsql security definer set search_path = public
as $$
declare
  v_fresh boolean;
  v_out public.playback_state;
begin
  select exists (
    select 1 from jsonb_each_text(p_state.buffering) e where e.value::bigint > p_now - 5000
  ) into v_fresh;

  if p_state.status = 'buffering' and p_state.resume_after_buffer and not v_fresh then
    -- Start slightly in the future so every client can line up before the same instant
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

create function public.report_buffering(
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
begin
  perform public.assert_active_member(p_room_id, v_uid);
  select * into v_state from public.playback_state where room_id = p_room_id for update;
  if v_state.room_id is null then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  perform public.mark_active(p_room_id, v_uid);
  v_now := public.server_time_ms();

  if coalesce(p_is_buffering, false) then
    -- Only a running (or already waiting) room is held; a paused room has nothing to hold
    if v_state.status not in ('playing', 'buffering') then
      return public.playback_dto(v_state);
    end if;
    update public.playback_state set
      buffering = buffering || jsonb_build_object(v_uid::text, v_now),
      anchor_position = case when status = 'playing' then public.expected_position(v_state, v_now) else anchor_position end,
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

-- Any member may call this after the 5 s wait: stalled clients that never came back stop blocking the room.
create function public.resolve_buffering(p_room_id uuid) returns jsonb
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
      from jsonb_each_text(buffering) e where e.value::bigint > v_now - 5000
    ), '{}'::jsonb),
    revision = revision + 1
  where room_id = p_room_id
  returning * into v_state;
  v_state := public.try_resume_after_buffer(v_state, v_now);
  return public.playback_dto(v_state);
end $$;

create or replace function public.player_command(
  p_room_id uuid,
  p_command_id uuid,
  p_type text,
  p_position double precision default null,
  p_media jsonb default null,
  p_playback_rate double precision default null,
  p_expected_revision integer default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_state public.playback_state;
  v_now bigint;
  v_status text;
  v_pos double precision;
  v_rate double precision;
  v_media jsonb;
begin
  perform public.assert_active_member(p_room_id, v_uid);
  if not public.can_control_playback(p_room_id, v_uid) then
    raise exception 'FORBIDDEN';
  end if;

  if p_type not in ('play', 'pause', 'seek', 'change-media', 'set-rate', 'buffering') then
    raise exception 'INVALID_PAYLOAD';
  end if;
  if p_position is not null and p_position < 0 then
    raise exception 'INVALID_PAYLOAD';
  end if;

  -- Row lock gives every room a deterministic command order.
  select * into v_state from public.playback_state where room_id = p_room_id for update;
  if v_state.room_id is null then
    insert into public.playback_state (room_id, anchor_server_time)
      values (p_room_id, public.server_time_ms())
      returning * into v_state;
  end if;

  perform public.mark_active(p_room_id, v_uid);

  -- Duplicate delivery of the same command never applies twice.
  if exists (select 1 from public.processed_commands where room_id = p_room_id and command_id = p_command_id) then
    return public.playback_dto(v_state);
  end if;

  -- A command based on an older revision must not overwrite newer state.
  if p_expected_revision is not null and p_expected_revision < v_state.revision then
    return public.playback_dto(v_state);
  end if;

  v_now := public.server_time_ms();
  v_status := v_state.status;
  v_pos := v_state.anchor_position;
  v_rate := v_state.playback_rate;
  v_media := v_state.media;

  if p_type = 'play' then
    v_status := 'playing';
    v_pos := coalesce(p_position, public.expected_position(v_state, v_now));
  elsif p_type = 'pause' then
    v_status := 'paused';
    v_pos := coalesce(p_position, public.expected_position(v_state, v_now));
  elsif p_type = 'seek' then
    v_pos := coalesce(p_position, 0);
  elsif p_type = 'buffering' then
    v_status := 'buffering';
    v_pos := coalesce(p_position, public.expected_position(v_state, v_now));
  elsif p_type = 'set-rate' then
    if p_playback_rate is null or p_playback_rate < 0.25 or p_playback_rate > 3 then
      raise exception 'INVALID_PAYLOAD';
    end if;
    v_pos := public.expected_position(v_state, v_now);
    v_rate := p_playback_rate;
  elsif p_type = 'change-media' then
    if p_media is null
       or coalesce(p_media ->> 'type', '') not in ('youtube','html5','vk','rutube','twitch','vimeo','hls')
       or coalesce(p_media ->> 'sourceId', '') = ''
       or coalesce(p_media ->> 'canonicalUrl', '') !~* '^https?://' then
      raise exception 'MEDIA_UNSUPPORTED';
    end if;
    v_media := jsonb_build_object(
      'type', p_media ->> 'type',
      'sourceId', p_media ->> 'sourceId',
      'canonicalUrl', p_media ->> 'canonicalUrl'
    );
    v_pos := 0;
    v_status := 'paused';
  end if;

  update public.playback_state set
    buffering = case when p_type in ('play', 'pause', 'change-media') then '{}'::jsonb else buffering end,
    resume_after_buffer = case when p_type in ('play', 'pause', 'change-media') then false else resume_after_buffer end,
    media = v_media,
    status = v_status,
    anchor_position = v_pos,
    anchor_server_time = v_now,
    playback_rate = v_rate,
    revision = revision + 1,
    updated_by = v_uid
  where room_id = p_room_id
  returning * into v_state;

  insert into public.processed_commands (room_id, command_id) values (p_room_id, p_command_id);
  if random() < 0.02 then
    delete from public.processed_commands where created_at < now() - interval '1 day';
  end if;

  return public.playback_dto(v_state);
end $$;

revoke execute on function public.try_resume_after_buffer(public.playback_state, bigint) from public, anon, authenticated;
revoke execute on function public.report_buffering(uuid, boolean, double precision) from public, anon;
revoke execute on function public.resolve_buffering(uuid) from public, anon;
grant execute on function public.report_buffering(uuid, boolean, double precision) to authenticated;
grant execute on function public.resolve_buffering(uuid) to authenticated;
