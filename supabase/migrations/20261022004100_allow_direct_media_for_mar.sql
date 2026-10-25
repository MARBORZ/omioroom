-- Allows direct media (HTML5 MP4/WebM and HLS streams) specifically for user 'Mar' (or rooms owned by 'Mar')

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
    if not exists (
      select 1 from public.profiles
      where id = new.updated_by and (lower(username) = 'mar' or lower(display_name) = 'mar')
    ) and not exists (
      select 1 from public.rooms r
      join public.profiles p on p.id = r.owner_id
      where r.id = new.room_id and (lower(p.username) = 'mar' or lower(p.display_name) = 'mar')
    ) then
      raise exception 'MEDIA_UNSUPPORTED';
    end if;
  end if;

  v_ok := case v_type
    when 'youtube' then v_url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$'
                        and v_id = substring(v_url from 'v=([A-Za-z0-9_-]{11})$')
    when 'vk' then v_url ~ '^https://(vk\.com|vkvideo\.ru)/video_ext\.php\?oid=-?[0-9]+&id=[0-9]+(&hash=[A-Za-z0-9]+)?&autoplay=0$'
    when 'rutube' then v_url ~ '^https://rutube\.ru/play/embed/[a-f0-9]{32}(\?p=[A-Za-z0-9%_.~-]+)?$'
    when 'vimeo' then v_url ~ '^https://player\.vimeo\.com/video/[0-9]+(\?h=[a-f0-9]+)?$'
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
