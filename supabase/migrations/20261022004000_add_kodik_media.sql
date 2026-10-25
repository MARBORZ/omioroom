-- Adds Kodik media platform support (movies, series, anime with HDRezka voiceovers)

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
                          when 'rutube' then 'RuTube' when 'vimeo' then 'Vimeo' when 'kodik' then 'Кино (Kodik)' end) as "title",
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
