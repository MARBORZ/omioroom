-- Public rooms feed, reports, and a link filter for chat in open rooms.

alter table public.rooms add column feed_hidden_until timestamptz;

-- ---------------------------------------------------------------------------
-- Feed: open rooms with someone inside and a video on. Names and chat are never shown.
-- ---------------------------------------------------------------------------
create function public.list_public_rooms(p_limit integer default 24) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_result jsonb;
begin
  perform public.check_rate(v_uid, 'feed', 30, interval '1 minute');
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x."participantCount" desc, x."updatedAt" desc), '[]'::jsonb)
  into v_result
  from (
    select
      r.global_id as "globalId",
      public.active_seat_count(r.id) as "participantCount",
      r.max_participants as "maxParticipants",
      p.status as "status",
      p.media ->> 'type' as "mediaType",
      p.media ->> 'sourceId' as "mediaSourceId",
      (select v.title from public.media_verdicts v where v.media_key = public.media_key_of(p.media)) as "mediaTitle",
      greatest(r.updated_at, to_timestamp(p.anchor_server_time / 1000.0)) as "updatedAt"
    from public.rooms r
    join public.playback_state p on p.room_id = r.id
    where r.status = 'active'
      and r.visibility = 'public'
      and p.media is not null
      and (r.feed_hidden_until is null or r.feed_hidden_until < now())
      and public.active_seat_count(r.id) > 0
      and public.active_seat_count(r.id) < r.max_participants
      and not public.is_banned(r.id, v_uid)
    order by 3 desc
    limit least(greatest(coalesce(p_limit, 24), 1), 50)
  ) x;
  return v_result;
end $$;
revoke execute on function public.list_public_rooms(integer) from public, anon;
grant execute on function public.list_public_rooms(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
create table public.reports (
  id bigserial primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  reporter_id uuid references public.profiles (id) on delete set null,
  message_id uuid,
  reason text not null,
  created_at timestamptz not null default now()
);
create index reports_room_idx on public.reports (room_id, created_at desc);
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;

-- A participant reports the room (or one chat message). Three different people reporting an open room within
-- a day take it off the feed for a day.
create function public.report_room(p_room_id uuid, p_reason text, p_message_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_reason text := trim(coalesce(p_reason, ''));
  v_visibility text;
  v_reporters integer;
begin
  perform public.assert_active_member(p_room_id, v_uid);
  perform public.check_rate(v_uid, 'report', 10, interval '1 hour');
  if char_length(v_reason) < 3 or char_length(v_reason) > 500 or not public.is_clean_text(v_reason) then
    raise exception 'INVALID_PAYLOAD';
  end if;
  if p_message_id is not null
     and not exists (select 1 from public.chat_messages where id = p_message_id and room_id = p_room_id) then
    raise exception 'INVALID_PAYLOAD';
  end if;

  if not exists (
    select 1 from public.reports
    where room_id = p_room_id and reporter_id = v_uid and message_id is not distinct from p_message_id
      and created_at > now() - interval '24 hours'
  ) then
    insert into public.reports (room_id, reporter_id, message_id, reason) values (p_room_id, v_uid, p_message_id, v_reason);
  end if;

  select visibility into v_visibility from public.rooms where id = p_room_id;
  select count(distinct reporter_id) into v_reporters
    from public.reports where room_id = p_room_id and created_at > now() - interval '24 hours';
  if v_visibility = 'public' and v_reporters >= 3 then
    update public.rooms set feed_hidden_until = now() + interval '24 hours' where id = p_room_id
      and (feed_hidden_until is null or feed_hidden_until < now());
    insert into public.moderation_events (room_id, user_id, kind, detail)
      values (p_room_id, null, 'room_hidden_from_feed', v_reporters || ' reports');
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.report_room(uuid, text, uuid) from public, anon;
grant execute on function public.report_room(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Links in the chat of open rooms: only the owner and people who may control the room can post them
-- ---------------------------------------------------------------------------
create or replace function public.validate_chat_message() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_clean_text(new.body) or not public.is_clean_text(new.sender_name) then
    raise exception 'INVALID_PAYLOAD';
  end if;
  if new.body ~* '(https?://|www\.|[a-z0-9-]+\.(com|ru|net|org|io|me|to|xyz|live|tv|gg|info|site|online|link)([/?#]|$|\s))'
     and exists (select 1 from public.rooms where id = new.room_id and visibility = 'public')
     and not public.can_control_playback(new.room_id, new.sender_id) then
    raise exception 'LINKS_NOT_ALLOWED';
  end if;
  return new;
end $$;
