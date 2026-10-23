-- Which video links a room accepts.
--  * Every room: the link must have the exact shape our own parser produces for its platform, on that platform's
--    own domain. (Players build their iframes from the link, so an arbitrary address would put any page in front
--    of every participant.)
--  * Open rooms: only the four platforms (YouTube, VK Video, RuTube, Vimeo), which age-gate and moderate their
--    own videos. Direct files and HLS streams from any site are for private rooms.

create function public.open_rooms_platforms_only() returns boolean
language sql immutable
as $$ select true $$;

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

  if v_type in ('html5', 'hls') and public.open_rooms_platforms_only() then
    select visibility into v_visibility from public.rooms where id = new.room_id;
    if v_visibility = 'public' then
      raise exception 'MEDIA_NOT_ALLOWED_IN_OPEN_ROOM';
    end if;
  end if;
  return new;
end $$;

-- Making a room open while it plays a direct file or stream stops that video
create function public.clear_direct_media_on_open() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.visibility = 'public' and old.visibility is distinct from 'public' and public.open_rooms_platforms_only() then
    update public.playback_state
      set media = null, status = 'paused', anchor_position = 0,
          anchor_server_time = public.server_time_ms(), revision = revision + 1,
          buffering = '{}'::jsonb, resume_after_buffer = false
      where room_id = new.id and media ->> 'type' in ('html5', 'hls');
  end if;
  return new;
end $$;
create trigger rooms_clear_direct_media_on_open after update of visibility on public.rooms
  for each row execute function public.clear_direct_media_on_open();
