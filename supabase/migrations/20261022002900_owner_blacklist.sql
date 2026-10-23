-- The blacklist belongs to the owner and works in all of their rooms: someone banned in one room cannot enter
-- the others, and the owner manages the list (and lifts bans) from their settings.

create table public.owner_bans (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  banned_at timestamptz not null default now(),
  primary key (owner_id, user_id)
);
alter table public.owner_bans enable row level security;
revoke all on public.owner_bans from anon, authenticated;

-- Existing room bans become bans for the whole owner
insert into public.owner_bans (owner_id, user_id, banned_at)
  select r.owner_id, b.user_id, b.banned_at from public.room_bans b join public.rooms r on r.id = b.room_id
  on conflict do nothing;

create function public.is_banned(p_room uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.room_bans where room_id = p_room and user_id = p_user)
      or exists (
        select 1 from public.owner_bans ob join public.rooms r on r.owner_id = ob.owner_id
        where r.id = p_room and ob.user_id = p_user
      )
$$;
revoke execute on function public.is_banned(uuid, uuid) from public, anon, authenticated;

-- Banning removes the person from every room of this owner
create or replace function public.ban_member(p_room_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_room public.rooms := public.owned_active_room(p_room_id, v_uid);
  v_other record;
begin
  if p_user_id is null or p_user_id = v_uid or p_user_id = v_room.owner_id then
    raise exception 'INVALID_PAYLOAD';
  end if;
  insert into public.owner_bans (owner_id, user_id) values (v_uid, p_user_id) on conflict do nothing;
  for v_other in select id from public.rooms where owner_id = v_uid and status = 'active' loop
    perform public.remove_member(v_other.id, p_user_id);
  end loop;
end $$;

-- Lifting a ban restores access to all the owner's rooms
create or replace function public.unban_member(p_room_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_room public.rooms := public.owned_active_room(p_room_id, v_uid);
begin
  delete from public.owner_bans where owner_id = v_uid and user_id = p_user_id;
  delete from public.room_bans where user_id = p_user_id
    and room_id in (select id from public.rooms where owner_id = v_uid);
end $$;

-- The owner's whole list, for the settings screen (works without being inside a room)
create function public.list_banned_users() returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('userId', b.user_id, 'displayName', p.display_name) order by b.banned_at), '[]'::jsonb)
  from public.owner_bans b join public.profiles p on p.id = b.user_id
  where b.owner_id = auth.uid()
$$;

create function public.unban_user(p_user_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := public.require_uid();
begin
  delete from public.owner_bans where owner_id = v_uid and user_id = p_user_id;
  delete from public.room_bans where user_id = p_user_id
    and room_id in (select id from public.rooms where owner_id = v_uid);
end $$;

revoke execute on function public.list_banned_users(), public.unban_user(uuid) from public, anon;
grant execute on function public.list_banned_users(), public.unban_user(uuid) to authenticated;

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

  if public.is_banned(v_room.id, v_uid) then
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

create or replace function public.resume_room(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_room public.rooms;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if v_room.id is null then
    return jsonb_build_object('error', 'ROOM_NOT_FOUND');
  end if;
  if v_room.status <> 'active' then
    return jsonb_build_object('error', 'ROOM_CLOSED');
  end if;
  if public.is_banned(p_room_id, v_uid) then
    return jsonb_build_object('error', 'BANNED');
  end if;
  if not exists (select 1 from public.room_members where room_id = p_room_id and user_id = v_uid) then
    return jsonb_build_object('error', 'NOT_MEMBER', 'globalId', v_room.global_id, 'visibility', v_room.visibility);
  end if;
  perform public.mark_active(p_room_id, v_uid);
  return public.build_snapshot(p_room_id, v_uid);
end $$;

create or replace function public.heartbeat_room(p_room_id uuid) returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_status text;
begin
  select status into v_status from public.rooms where id = p_room_id;
  if v_status is null then
    return 'ROOM_NOT_FOUND';
  end if;
  if v_status <> 'active' then
    return 'ROOM_CLOSED';
  end if;
  if public.is_banned(p_room_id, v_uid) then
    return 'BANNED';
  end if;
  if not exists (select 1 from public.room_members where room_id = p_room_id and user_id = v_uid) then
    return 'NOT_MEMBER';
  end if;
  perform public.mark_active(p_room_id, v_uid);
  return 'OK';
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
    'mutedUserIds', coalesce((select jsonb_agg(mu.user_id) from public.room_mutes mu where mu.room_id = p_room_id), '[]'::jsonb),
    'unreadCount', (
      select count(*) from public.chat_messages c
      where c.room_id = p_room_id and c.sender_id <> p_viewer and c.created_at > greatest(coalesce(v_seen, '-infinity'::timestamptz), coalesce(v_base, '-infinity'::timestamptz))
    ),
    'bannedUsers', case when v_room.owner_id = p_viewer then coalesce((
      select jsonb_agg(jsonb_build_object('userId', b.user_id, 'displayName', p.display_name) order by b.banned_at)
      from public.owner_bans b join public.profiles p on p.id = b.user_id
      where b.owner_id = v_room.owner_id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'playback', case when v_state.room_id is null then null else public.playback_dto(v_state) end
  );
end $$;
