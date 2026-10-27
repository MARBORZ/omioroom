-- Dzen and Dailymotion were dropped again (no remote control API): only Odnoklassniki stays

create or replace function public.validate_playback_media() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_url text := coalesce(new.media ->> 'canonicalUrl', '');
  v_id text := coalesce(new.media ->> 'sourceId', '');
  v_type text := new.media ->> 'type';
  v_visibility text;
  v_ok boolean;
begin
  if new.media is null then
    return new;
  end if;

  if char_length(v_url) > 2048 or char_length(v_id) > 512 or v_url ~ '\s'
     or not public.is_clean_text(v_url) or not public.is_clean_text(v_id) then
    raise exception 'MEDIA_UNSUPPORTED';
  end if;

  -- Only a media CHANGE needs the admin; everyone in the room may still pause/seek what the admin started.
  if v_type in ('html5', 'hls')
     and (tg_op = 'INSERT' or new.media is distinct from old.media)
     and not public.direct_media_allowed()
     and not public.is_admin(new.updated_by) then
    raise exception 'MEDIA_UNSUPPORTED';
  end if;

  v_ok := case v_type
    when 'youtube' then v_url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$'
                        and v_id = substring(v_url from 'v=([A-Za-z0-9_-]{11})$')
    when 'vk' then v_url ~ '^https://(vk\.com|vkvideo\.ru)/video_ext\.php\?oid=-?[0-9]+&id=[0-9]+(&hash=[A-Za-z0-9]+)?&autoplay=0$'
    when 'rutube' then v_url ~ '^https://rutube\.ru/play/embed/[a-f0-9]{32}(\?p=[A-Za-z0-9%_.~-]+)?$'
    when 'vimeo' then v_url ~ '^https://player\.vimeo\.com/video/[0-9]+(\?h=[a-f0-9]+)?$'
    when 'ok' then v_url ~ '^https://ok\.ru/videoembed/[0-9]{5,20}$' and v_id = substring(v_url from '/videoembed/([0-9]+)$')
    when 'kodik' then v_url ~* '^https://([a-zA-Z0-9-]+\.)*(kodik\.info|kodikplayer\.com|aniqit\.com|anivod\.com|kodik\.biz|kodik\.cc)/(video|seria|serial)/[0-9]+/[a-zA-Z0-9]+(/[a-zA-Z0-9]+)?(\?[^#\s]*)?$'
    when 'html5' then v_url ~* '^https?://[^/]+/'
    when 'hls' then v_url ~* '^https?://[^/]+/'
    else false
  end;
  if not coalesce(v_ok, false) then
    raise exception 'MEDIA_UNSUPPORTED';
  end if;

  select visibility into v_visibility from public.rooms where id = new.room_id;
  if v_visibility = 'public' then
    if tg_op = 'UPDATE' and new.media is distinct from old.media and new.updated_by is not null
       and (select count(*) from public.moderation_events
            where user_id = new.updated_by and kind = 'media_blocked' and created_at > now() - interval '24 hours') >= 3 then
      raise exception 'MEDIA_COOLDOWN';
    end if;
  end if;
  return new;
end $$;

create or replace function public.get_recommendations(p_limit integer default 12) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_result jsonb;
begin
  perform public.check_rate(v_uid, 'recommendations', 30, interval '1 minute');
  select coalesce(jsonb_agg(to_jsonb(x) - 'score' order by x.score desc), '[]'::jsonb)
  into v_result
  from (
    select
      r.global_id as "globalId",
      coalesce(v.title, case p.media ->> 'type' when 'youtube' then 'YouTube' when 'vk' then 'VK Video'
                          when 'rutube' then 'RuTube' when 'vimeo' then 'Vimeo' when 'kodik' then 'Kodik'
                                                else 'Видео' end) as "title",
      (v.title is not null) as "hasTitle",
      s.seats as "participantCount",
      r.max_participants as "maxParticipants",
      p.media ->> 'type' as "platform",
      coalesce(v.thumbnail_url,
               case when p.media ->> 'type' = 'youtube' then 'https://i.ytimg.com/vi/' || (p.media ->> 'sourceId') || '/hqdefault.jpg' end
      ) as "thumbnailUrl",
      owner_p.display_name as "ownerName",
      p.status as "status",
      s.friends as "friendsInside",
      case when s.friends > 0 then 'friends'
           when p.status = 'playing' and s.seats >= 3 then 'popular'
           when p.status = 'playing' then 'live' end as "badge",
      least(s.seats, 8) * 2.0
        + case when p.status = 'playing' then 3 else 0 end
        + greatest(0, 3 - extract(epoch from (now() - greatest(r.updated_at, to_timestamp(p.anchor_server_time / 1000.0)))) / 600.0)
        + case when s.friends > 0 then 6 else 0 end
        + (abs(hashtext(r.id::text || to_char(now(), 'YYYYMMDDHH24'))) % 100) / 100.0 as score
    from public.rooms r
    join public.profiles owner_p on owner_p.id = r.owner_id
    join public.playback_state p on p.room_id = r.id
    cross join lateral (
      select count(*)::int as seats,
             count(f.friend_id)::int as friends
      from public.member_activity a
      left join public.friendships f on f.user_id = v_uid and f.friend_id = a.user_id
      where a.room_id = r.id and a.last_active_at > public.seat_active_cutoff()
    ) s
    left join public.media_verdicts v on v.media_key = public.media_key_of(p.media) and v.verdict = 'ok'
    where r.status = 'active'
      and r.visibility = 'public'
      and p.media is not null
      and (r.feed_hidden_until is null or r.feed_hidden_until < now())
      and s.seats > 0
      and s.seats < r.max_participants
      and not public.is_banned(r.id, v_uid)
      and not exists (select 1 from public.room_members m where m.room_id = r.id and m.user_id = v_uid)
    order by score desc
    limit least(greatest(coalesce(p_limit, 12), 1), 30)
  ) x;
  return v_result;
end $$;
revoke execute on function public.get_recommendations(integer) from public, anon;
grant execute on function public.get_recommendations(integer) to authenticated;

-- The command itself checked the type against its own list (which also lacked kodik)
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
       or coalesce(p_media ->> 'type', '') not in ('youtube','html5','vk','rutube','vimeo','hls','kodik','ok')
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
