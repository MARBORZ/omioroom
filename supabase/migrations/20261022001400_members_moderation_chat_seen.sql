-- Membership lifecycle, moderation and chat read state.
--  * "Leave" really leaves: the membership is removed and coming back needs the code / invitation again
--    (the owner keeps their place).
--  * Members who stay offline for 5 minutes drop out of the participant list on their own.
--  * The owner can kick (they may come back) and ban (they may not) members.
--  * Chat read state ("have seen"): each member's last seen message, unread counter, read receipts.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.room_bans (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  banned_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table public.room_bans enable row level security;
revoke all on public.room_bans from anon, authenticated;

create table public.chat_seen (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_seen_message_id uuid,
  last_seen_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table public.chat_seen enable row level security;
revoke all on public.chat_seen from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Removing a member (used by leave, kick, ban and the offline sweep)
-- ---------------------------------------------------------------------------

create function public.remove_member(p_room_id uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.member_activity where room_id = p_room_id and user_id = p_user;
  delete from public.chat_seen where room_id = p_room_id and user_id = p_user;
  update public.playback_state set buffering = buffering - p_user::text
    where room_id = p_room_id and buffering ? p_user::text;
  delete from public.room_members where room_id = p_room_id and user_id = p_user and role <> 'owner';
end $$;
revoke execute on function public.remove_member(uuid, uuid) from public, anon, authenticated;

-- Leaving: the owner only frees their seat; everyone else leaves the room completely.
create or replace function public.leave_room(p_room_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := public.require_uid();
begin
  if exists (select 1 from public.rooms where id = p_room_id and owner_id = v_uid) then
    update public.member_activity set last_active_at = to_timestamp(0)
      where room_id = p_room_id and user_id = v_uid;
  else
    perform public.remove_member(p_room_id, v_uid);
  end if;
end $$;

-- Members who have not shown a sign of life for 5 minutes are dropped from the list.
create function public.drop_offline_members(p_max_idle interval default interval '5 minutes') returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_count integer := 0;
  v_row record;
begin
  for v_row in
    select m.room_id, m.user_id
    from public.room_members m
    join public.rooms r on r.id = m.room_id and r.status = 'active'
    left join public.member_activity a on a.room_id = m.room_id and a.user_id = m.user_id
    where m.role <> 'owner'
      and coalesce(a.last_active_at, m.joined_at) < now() - p_max_idle
  loop
    perform public.remove_member(v_row.room_id, v_row.user_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function public.drop_offline_members(interval) from public, anon, authenticated;

do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.schedule(
      'omioroom-drop-offline-members',
      '* * * * *',
      $job$ select public.drop_offline_members(interval '5 minutes') $job$
    );
  end if;
exception when others then
  raise notice 'could not schedule cron job: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- Kick / ban / unban (owner only)
-- ---------------------------------------------------------------------------

create function public.kick_member(p_room_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_room public.rooms := public.owned_active_room(p_room_id, v_uid);
begin
  if p_user_id is null or p_user_id = v_uid or p_user_id = v_room.owner_id then
    raise exception 'INVALID_PAYLOAD';
  end if;
  perform public.remove_member(p_room_id, p_user_id);
end $$;

create function public.ban_member(p_room_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_room public.rooms := public.owned_active_room(p_room_id, v_uid);
begin
  if p_user_id is null or p_user_id = v_uid or p_user_id = v_room.owner_id then
    raise exception 'INVALID_PAYLOAD';
  end if;
  insert into public.room_bans (room_id, user_id) values (p_room_id, p_user_id) on conflict do nothing;
  perform public.remove_member(p_room_id, p_user_id);
end $$;

create function public.unban_member(p_room_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_room public.rooms := public.owned_active_room(p_room_id, v_uid);
begin
  delete from public.room_bans where room_id = p_room_id and user_id = p_user_id;
end $$;

-- ---------------------------------------------------------------------------
-- Chat read state
-- ---------------------------------------------------------------------------

create function public.mark_chat_seen(p_room_id uuid, p_message_id uuid) returns void
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
    where public.chat_seen.last_seen_at < excluded.last_seen_at;
end $$;

-- ---------------------------------------------------------------------------
-- Join: banned users are refused; a newcomer starts with an empty unread counter
-- ---------------------------------------------------------------------------

create or replace function public.join_room(p_global_id text, p_private_code text default null) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_room public.rooms;
  v_member public.room_members;
  v_secret public.room_secrets;
  v_active integer;
begin
  perform public.check_rate(v_uid, 'join_room', 15, interval '60 seconds');

  if p_global_id is null or p_global_id !~ '^[0-9]{6}$' then
    return jsonb_build_object('error', 'INVALID_PAYLOAD');
  end if;

  select * into v_room from public.rooms where global_id = p_global_id and status = 'active';
  if v_room.id is null then
    return jsonb_build_object('error', 'ROOM_NOT_FOUND');
  end if;

  if exists (select 1 from public.room_bans where room_id = v_room.id and user_id = v_uid) then
    return jsonb_build_object('error', 'BANNED');
  end if;

  select * into v_member from public.room_members where room_id = v_room.id and user_id = v_uid;

  if v_room.visibility = 'private' and v_room.owner_id <> v_uid and v_member.user_id is null then
    if p_private_code is null or trim(p_private_code) = '' then
      return jsonb_build_object('error', 'PRIVATE_CODE_REQUIRED');
    end if;
    select * into v_secret from public.room_secrets where room_id = v_room.id;
    if v_secret.room_id is null
       or v_secret.revoked_at is not null
       or v_secret.secret_hash <> public.hash_secret(trim(p_private_code)) then
      return jsonb_build_object('error', 'INVALID_PRIVATE_CODE');
    end if;
  end if;

  select count(*) into v_active
    from public.member_activity
    where room_id = v_room.id and user_id <> v_uid and last_active_at > public.seat_active_cutoff();
  if v_active >= v_room.max_participants then
    return jsonb_build_object('error', 'ROOM_FULL');
  end if;

  if v_member.user_id is null then
    insert into public.room_members (room_id, user_id, role) values (v_room.id, v_uid, 'member');
    insert into public.chat_seen (room_id, user_id) values (v_room.id, v_uid) on conflict do nothing;
  end if;
  perform public.mark_active(v_room.id, v_uid);

  return public.build_snapshot(v_room.id, v_uid);
end $$;

-- ---------------------------------------------------------------------------
-- Snapshot: read receipts, unread counter, banned list (owner)
-- ---------------------------------------------------------------------------

create or replace function public.build_snapshot(p_room_id uuid, p_viewer uuid) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_room public.rooms;
  v_state public.playback_state;
  v_seen timestamptz;
begin
  select * into v_room from public.rooms where id = p_room_id;
  select * into v_state from public.playback_state where room_id = p_room_id;
  select last_seen_at into v_seen from public.chat_seen where room_id = p_room_id and user_id = p_viewer;
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
      where c.room_id = p_room_id and c.sender_id <> p_viewer and c.created_at > coalesce(v_seen, '-infinity'::timestamptz)
    ),
    'bannedUsers', case when v_room.owner_id = p_viewer then coalesce((
      select jsonb_agg(jsonb_build_object('userId', b.user_id, 'displayName', p.display_name) order by b.banned_at)
      from public.room_bans b join public.profiles p on p.id = b.user_id
      where b.room_id = p_room_id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'playback', case when v_state.room_id is null then null else public.playback_dto(v_state) end
  );
end $$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke execute on function
  public.kick_member(uuid, uuid), public.ban_member(uuid, uuid), public.unban_member(uuid, uuid),
  public.mark_chat_seen(uuid, uuid)
  from public, anon;
grant execute on function
  public.kick_member(uuid, uuid), public.ban_member(uuid, uuid), public.unban_member(uuid, uuid),
  public.mark_chat_seen(uuid, uuid)
  to authenticated;
