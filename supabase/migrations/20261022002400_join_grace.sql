-- New arrivals cannot move the room's playback during a short grace period after (re)joining.
-- The server is the single source of truth; a player that is still aligning itself must not rewrite it.

alter table public.member_activity add column session_started_at timestamptz not null default now();

create function public.join_grace() returns interval
language sql immutable
as $$ select interval '3 seconds' $$;

-- A new session starts when someone appears or comes back after being inactive (seat window is 90 s)
create or replace function public.mark_active(p_room uuid, p_user uuid, p_at timestamptz default now()) returns void
language sql security definer set search_path = public
as $$
  insert into public.member_activity (room_id, user_id, last_active_at, session_started_at)
  values (p_room, p_user, p_at, p_at)
  on conflict (room_id, user_id) do update set
    session_started_at = case
      when public.member_activity.last_active_at < p_at - interval '90 seconds' then excluded.session_started_at
      else public.member_activity.session_started_at
    end,
    last_active_at = excluded.last_active_at
$$;

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
  -- Generous burst allowance (scrubbing, quick toggles) but protects the database from floods
  perform public.check_rate(v_uid, 'player', 60, interval '10 seconds');

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

  -- A participant who has just arrived (join, reload, back from sleep) is still lining their player up with
  -- the room. Whatever their player reports in that first moment must not move everyone else.
  if p_type in ('play', 'pause', 'seek')
     and v_uid <> (select owner_id from public.rooms where id = p_room_id)
     and exists (
    select 1 from public.member_activity
    where room_id = p_room_id and user_id = v_uid
      and session_started_at > now() - public.join_grace()
  ) then
    return public.playback_dto(v_state);
  end if;

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
       or coalesce(p_media ->> 'type', '') not in ('youtube','html5','vk','rutube','vimeo','hls')
       or coalesce(p_media ->> 'sourceId', '') = ''
       or coalesce(p_media ->> 'canonicalUrl', '') !~* '^https?://' then
      raise exception 'MEDIA_UNSUPPORTED';
    end if;
    if v_state.media is not null
       and v_state.media ->> 'type' = p_media ->> 'type'
       and (v_state.media ->> 'sourceId' = p_media ->> 'sourceId'
            or v_state.media ->> 'canonicalUrl' = p_media ->> 'canonicalUrl') then
      raise exception 'MEDIA_ALREADY_LOADED';
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

revoke execute on function public.player_command(uuid, uuid, text, double precision, jsonb, double precision, integer) from public, anon;
grant execute on function public.player_command(uuid, uuid, text, double precision, jsonb, double precision, integer) to authenticated;
