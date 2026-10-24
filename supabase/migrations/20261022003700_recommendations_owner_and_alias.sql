-- Recommendations: adds ownerName to recommendations and re-establishes list_public_rooms as an alias to get_recommendations.

drop function if exists public.get_recommendations(integer);

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

create or replace function public.list_public_rooms(p_limit integer default 24) returns jsonb
language sql security definer set search_path = public
as $$
  select public.get_recommendations(p_limit);
$$;
revoke execute on function public.list_public_rooms(integer) from public, anon;
grant execute on function public.list_public_rooms(integer) to authenticated;
