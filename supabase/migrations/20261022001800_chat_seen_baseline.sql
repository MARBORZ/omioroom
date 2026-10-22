-- Read receipts must reflect real reading. Joining used to record "seen up to now", which showed double
-- ticks for messages nobody read. Joining now only sets a baseline for the unread counter.
alter table public.chat_seen add column baseline_at timestamptz not null default now();
alter table public.chat_seen alter column last_seen_at drop not null;
alter table public.chat_seen alter column last_seen_at drop default;
update public.chat_seen set baseline_at = last_seen_at, last_seen_at = null where last_seen_message_id is null;

create or replace function public.mark_chat_seen(p_room_id uuid, p_message_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_at timestamptz;
begin
  perform public.assert_active_member(p_room_id, v_uid);
  perform public.check_rate(v_uid, 'chat_seen', 60, interval '10 seconds');
  select created_at into v_at from public.chat_messages where id = p_message_id and room_id = p_room_id;
  if v_at is null then
    return;
  end if;
  insert into public.chat_seen (room_id, user_id, last_seen_message_id, last_seen_at)
  values (p_room_id, v_uid, p_message_id, v_at)
  on conflict (room_id, user_id) do update
    set last_seen_message_id = excluded.last_seen_message_id, last_seen_at = excluded.last_seen_at
    where public.chat_seen.last_seen_at is null or public.chat_seen.last_seen_at < excluded.last_seen_at;
end $$;

create or replace function public.build_snapshot(p_room_id uuid, p_viewer uuid) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_room public.rooms;
  v_state public.playback_state;
  v_seen timestamptz;
  v_base timestamptz;
begin
  select * into v_room from public.rooms where id = p_room_id;
  select * into v_state from public.playback_state where room_id = p_room_id;
  select last_seen_at, baseline_at into v_seen, v_base from public.chat_seen where room_id = p_room_id and user_id = p_viewer;
  return jsonb_build_object(
    'room', public.room_dto(v_room),
    'isOwner', v_room.owner_id = p_viewer,
    'canControl', public.can_control_playback(p_room_id, p_viewer),
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', m.user_id,
        'displayName', p.display_name,
        'role', m.role,
        'canControl', m.role = 'owner' or m.can_control,
        'joinedAt', m.joined_at,
        'isOnline', coalesce(a.last_active_at > public.seat_active_cutoff(), false),
        'chatSeenAt', s.last_seen_at
      ) order by m.joined_at)
      from public.room_members m
      join public.profiles p on p.id = m.user_id
      left join public.member_activity a on a.room_id = m.room_id and a.user_id = m.user_id
      left join public.chat_seen s on s.room_id = m.room_id and s.user_id = m.user_id
      where m.room_id = p_room_id
    ), '[]'::jsonb),
    'unreadCount', (
      select count(*) from public.chat_messages c
      where c.room_id = p_room_id and c.sender_id <> p_viewer and c.created_at > greatest(coalesce(v_seen, '-infinity'::timestamptz), coalesce(v_base, '-infinity'::timestamptz))
    ),
    'bannedUsers', case when v_room.owner_id = p_viewer then coalesce((
      select jsonb_agg(jsonb_build_object('userId', b.user_id, 'displayName', p.display_name) order by b.banned_at)
      from public.room_bans b join public.profiles p on p.id = b.user_id
      where b.room_id = p_room_id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'playback', case when v_state.room_id is null then null else public.playback_dto(v_state) end
  );
end $$;

