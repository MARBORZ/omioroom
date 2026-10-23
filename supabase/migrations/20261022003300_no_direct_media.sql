-- Direct files and streams (any site, or private uploads) are no longer supported in any room: nobody can see or
-- moderate what they contain. Only YouTube, VK Video, RuTube and Vimeo remain, which age-gate and moderate
-- their own videos. (The switch is a function so that tests, which play simple direct links, can turn it on.)

create function public.direct_media_allowed() returns boolean
language sql immutable
as $$ select false $$;

-- Stop whatever direct video is playing now
update public.playback_state
  set media = null, status = 'paused', anchor_position = 0, anchor_server_time = public.server_time_ms(),
      revision = revision + 1, buffering = '{}'::jsonb, resume_after_buffer = false
  where media ->> 'type' in ('html5', 'hls');

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

  if v_type in ('html5', 'hls') and not public.direct_media_allowed() then
    raise exception 'MEDIA_UNSUPPORTED';
  end if;

  v_ok := case v_type
    when 'youtube' then v_url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$'
                        and v_id = substring(v_url from 'v=([A-Za-z0-9_-]{11})$')
    when 'vk' then v_url ~ '^https://(vk\.com|vkvideo\.ru)/video_ext\.php\?oid=-?[0-9]+&id=[0-9]+(&hash=[A-Za-z0-9]+)?&autoplay=0$'
    when 'rutube' then v_url ~ '^https://rutube\.ru/play/embed/[a-f0-9]{32}(\?p=[A-Za-z0-9%_.~-]+)?$'
    when 'vimeo' then v_url ~ '^https://player\.vimeo\.com/video/[0-9]+(\?h=[a-f0-9]+)?$'
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
