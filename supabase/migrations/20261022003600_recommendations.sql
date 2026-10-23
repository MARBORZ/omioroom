-- Recommendations: the home page offers open rooms that are being watched right now, with the video title,
-- number of participants and a banner image. Replaces list_public_rooms.
--
-- Ranking (light, explainable):
--   score = 2 per participant (up to 8) + 3 while the video is playing + up to 3 for fresh activity (fading over
--           30 minutes) + 5 if a friend of the viewer is inside + a gentle 0..1 rotation that changes every hour,
--           so the same room is not always first.
-- Rooms the viewer is already in, rooms of owners who banned the viewer, rooms hidden by reports, full rooms,
-- empty rooms and rooms without a video are left out. Names of people and chat are never included.

alter table public.media_verdicts add column thumbnail_url text;

drop function if exists public.record_media_verdict(uuid, text, text, text, text, text);
create function public.record_media_verdict(
  p_room_id uuid, p_media_key text, p_title text, p_verdict text, p_reason text,
  p_display_title text default null, p_thumbnail_url text default null
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_term text;
begin
  if p_verdict = 'ok' then
    v_term := public.find_blocked_term(p_title);
    if v_term is not null then
      p_verdict := 'blocked';
      p_reason := 'title';
    end if;
  end if;
  -- Only plain https addresses are kept as banners
  if p_thumbnail_url is not null and (p_thumbnail_url !~ '^https://[^\s]+$' or char_length(p_thumbnail_url) > 500
                                      or not public.is_clean_text(p_thumbnail_url)) then
    p_thumbnail_url := null;
  end if;
  insert into public.media_verdicts (media_key, title, verdict, reason, thumbnail_url)
    values (p_media_key, left(coalesce(nullif(trim(p_display_title), ''), p_title), 300), p_verdict, p_reason, p_thumbnail_url)
    on conflict (media_key) do update
      set title = excluded.title, verdict = excluded.verdict, reason = excluded.reason,
          thumbnail_url = excluded.thumbnail_url, checked_at = now();
  if p_verdict = 'blocked' then
    return public.reject_media(p_room_id, p_media_key, p_reason);
  end if;
  return false;
end $$;
revoke execute on function public.record_media_verdict(uuid, text, text, text, text, text, text) from public, anon, authenticated;

drop function if exists public.list_public_rooms(integer);

create function public.get_recommendations(p_limit integer default 12) returns jsonb
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
                          when 'rutube' then 'RuTube' when 'vimeo' then 'Vimeo' end) as "title",
      (v.title is not null) as "hasTitle",
      s.seats as "participantCount",
      r.max_participants as "maxParticipants",
      p.media ->> 'type' as "platform",
      coalesce(v.thumbnail_url,
               case when p.media ->> 'type' = 'youtube' then 'https://i.ytimg.com/vi/' || (p.media ->> 'sourceId') || '/hqdefault.jpg' end
      ) as "thumbnailUrl",
      p.status as "status",
      s.friends as "friendsInside",
      case when s.friends > 0 then 'friends'
           when p.status = 'playing' and s.seats >= 3 then 'popular'
           when p.status = 'playing' then 'live' end as "badge",
      least(s.seats, 8) * 2.0
        + case when p.status = 'playing' then 3 else 0 end
        + greatest(0, 3 - extract(epoch from (now() - greatest(r.updated_at, to_timestamp(p.anchor_server_time / 1000.0)))) / 600.0)
        + case when s.friends > 0 then 5 else 0 end
        + (abs(hashtext(r.id::text || to_char(now(), 'YYYYMMDDHH24'))) % 100) / 100.0 as score
    from public.rooms r
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
