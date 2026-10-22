-- Muting: the owner and people who may control playback can mute ordinary participants.
-- A muted participant cannot send chat messages (enforced here) and their microphone is silenced
-- (clients obey the list from the room snapshot). The owner and people who may control cannot be muted.

create table public.room_mutes (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  muted_by uuid references public.profiles (id) on delete set null,
  muted_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table public.room_mutes enable row level security;
revoke all on public.room_mutes from anon, authenticated;
grant select on public.room_mutes to authenticated;
create policy room_mutes_read on public.room_mutes for select to authenticated
  using (public.is_room_member(room_id));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_mutes'
     ) then
    alter publication supabase_realtime add table public.room_mutes;
  end if;
end $$;

create function public.set_member_muted(p_room_id uuid, p_user_id uuid, p_muted boolean) returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := public.require_uid();
begin
  perform public.assert_active_member(p_room_id, v_uid);
  if not public.can_control_playback(p_room_id, v_uid) then
    raise exception 'FORBIDDEN';
  end if;
  if p_user_id is null or p_user_id = v_uid
     or not exists (select 1 from public.room_members where room_id = p_room_id and user_id = p_user_id) then
    raise exception 'INVALID_PAYLOAD';
  end if;
  if coalesce(p_muted, false) then
    -- The owner and anyone who may control the room cannot be muted
    if public.can_control_playback(p_room_id, p_user_id) then
      raise exception 'FORBIDDEN';
    end if;
    insert into public.room_mutes (room_id, user_id, muted_by) values (p_room_id, p_user_id, v_uid)
      on conflict (room_id, user_id) do nothing;
  else
    delete from public.room_mutes where room_id = p_room_id and user_id = p_user_id;
  end if;
end $$;
revoke execute on function public.set_member_muted(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_member_muted(uuid, uuid, boolean) to authenticated;

-- Muted participants cannot post to the chat, whichever function inserts the message
create function public.block_muted_chat() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.room_mutes where room_id = new.room_id and user_id = new.sender_id) then
    raise exception 'MUTED';
  end if;
  return new;
end $$;
create trigger chat_messages_block_muted before insert on public.chat_messages
  for each row execute function public.block_muted_chat();

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
    'mutedUserIds', coalesce((select jsonb_agg(mu.user_id) from public.room_mutes mu where mu.room_id = p_room_id), '[]'::jsonb),
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

