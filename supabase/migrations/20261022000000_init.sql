-- OMIOROOM: schema, access rules and RPC functions.
--
-- Model: clients never write tables directly. All mutations go through the
-- SECURITY DEFINER functions below, which authenticate via auth.uid(), validate
-- input and enforce the rules from the technical spec (authoritative playback
-- state, revisions, command dedup, private rooms, 2-seat limit).
-- Errors are raised as stable codes (e.g. 'ROOM_FULL') that the client maps to
-- the protocol error codes in @omioroom/contracts.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  kind text not null check (kind in ('anonymous', 'nickname', 'registered')),
  display_name text not null check (char_length(display_name) between 2 and 30),
  username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_username_key on public.profiles (lower(username)) where username is not null;

create table public.friendships (
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  global_id text not null check (global_id ~ '^[0-9]{6}$'),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default 'Watch Room' check (char_length(title) between 1 and 60),
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  status text not null default 'active' check (status in ('active', 'closed')),
  max_participants integer not null default 8 check (max_participants between 2 and 32),
  -- who may play/pause/seek/change media: everyone, the owner plus members they pick, or the owner only
  control_mode text not null default 'everyone' check (control_mode in ('everyone', 'selected', 'owner')),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index rooms_active_global_id_key on public.rooms (global_id) where status = 'active';
create index rooms_owner_idx on public.rooms (owner_id);

-- Only the hash of the private code is stored; the table is unreachable for clients.
create table public.room_secrets (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  secret_hash text not null,
  rotated_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  can_control boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index room_members_user_idx on public.room_members (user_id);

-- Heartbeats live here, not in room_members, so they never fan out through Realtime.
create table public.member_activity (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_active_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table public.playback_state (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  media jsonb,
  status text not null default 'paused' check (status in ('playing', 'paused', 'buffering', 'ended')),
  anchor_position double precision not null default 0 check (anchor_position >= 0),
  anchor_server_time bigint not null,
  playback_rate double precision not null default 1 check (playback_rate between 0.25 and 3),
  revision integer not null default 0,
  updated_by uuid references public.profiles (id) on delete set null
);

create table public.processed_commands (
  room_id uuid not null references public.rooms (id) on delete cascade,
  command_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (room_id, command_id)
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  sender_name text not null,
  body text not null default '',
  attachment_url text,
  attachment_type text check (attachment_type in ('image', 'file')),
  created_at timestamptz not null default now()
);
create index chat_messages_room_idx on public.chat_messages (room_id, created_at desc);

create table public.idempotency_keys (
  user_id uuid not null,
  request_id uuid not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

create table public.rate_events (
  user_id uuid not null,
  kind text not null,
  at timestamptz not null default now()
);
create index rate_events_idx on public.rate_events (user_id, kind, at desc);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.require_uid() returns uuid
language plpgsql stable
as $$
declare v uuid := auth.uid();
begin
  if v is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  return v;
end $$;

create function public.server_time_ms() returns bigint
language sql stable
as $$ select floor(extract(epoch from clock_timestamp()) * 1000)::bigint $$;

-- A seat is "active" when its owner showed activity recently (join/heartbeat/command).
create function public.seat_active_cutoff() returns timestamptz
language sql stable
as $$ select now() - interval '90 seconds' $$;

create function public.mark_active(p_room uuid, p_user uuid, p_at timestamptz default now()) returns void
language sql security definer set search_path = public
as $$
  insert into public.member_activity (room_id, user_id, last_active_at) values (p_room, p_user, p_at)
  on conflict (room_id, user_id) do update set last_active_at = excluded.last_active_at
$$;

create function public.is_room_member(p_room uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.room_members where room_id = p_room and user_id = auth.uid()
  )
$$;

create function public.shares_room_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.room_members a
    join public.room_members b on a.room_id = b.room_id
    where a.user_id = auth.uid() and b.user_id = p_user
  )
$$;

create function public.is_friend_of(p_user uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.friendships where user_id = auth.uid() and friend_id = p_user
  )
$$;

-- Sliding-window limiter. Raises RATE_LIMITED when the window is full.
create function public.check_rate(p_user uuid, p_kind text, p_max integer, p_window interval)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_count integer;
begin
  select count(*) into v_count
  from public.rate_events
  where user_id = p_user and kind = p_kind and at > now() - p_window;
  if v_count >= p_max then
    raise exception 'RATE_LIMITED';
  end if;
  insert into public.rate_events (user_id, kind) values (p_user, p_kind);
  if random() < 0.02 then
    delete from public.rate_events where at < now() - interval '1 hour';
  end if;
end $$;

-- 8 chars from an unambiguous alphabet, from the CSPRNG behind gen_random_uuid().
create function public.generate_private_code() returns text
language plpgsql volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  code text := '';
  i integer;
begin
  for i in 0..7 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return code;
end $$;

create function public.hash_secret(p_secret text) returns text
language sql immutable
as $$ select encode(sha256(convert_to(p_secret, 'UTF8')), 'hex') $$;

create function public.random_display_name() returns text
language plpgsql volatile
as $$
declare
  adjectives text[] := array['retro','quiet','analog','cozy','neon','amber','vhs','velvet','chroma','tape'];
  nouns text[] := array['fox','tiger','bear','hawk','pilot','echo','runner','signal','ghost','watcher'];
begin
  return adjectives[1 + floor(random() * 10)::int] || '-' ||
         nouns[1 + floor(random() * 10)::int] || '-' ||
         (100 + floor(random() * 900)::int)::text;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles follow auth.users (anonymous sign-in, email sign-up, anon -> permanent)
-- ---------------------------------------------------------------------------

create function public.handle_auth_user() returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_username text;
begin
  if tg_op = 'INSERT' then
    if coalesce(new.is_anonymous, false) then
      insert into public.profiles (id, kind, display_name)
      values (new.id, 'anonymous', public.random_display_name());
    else
      v_username := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), split_part(new.email, '@', 1)), 30);
      if char_length(v_username) < 2 then v_username := v_username || '_u'; end if;
      insert into public.profiles (id, kind, display_name, username)
      values (new.id, 'registered', v_username, v_username);
    end if;
  elsif coalesce(old.is_anonymous, false) and not coalesce(new.is_anonymous, false) then
    v_username := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), split_part(new.email, '@', 1)), 30);
    if char_length(v_username) < 2 then v_username := v_username || '_u'; end if;
    update public.profiles
      set kind = 'registered', username = v_username, display_name = v_username, updated_at = now()
      where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_auth_user();

create trigger on_auth_user_upgraded
  after update of is_anonymous on auth.users
  for each row execute function public.handle_auth_user();

-- Creates the profile for an existing auth user if it is missing (users created before the
-- schema existed, or a failed trigger). Safe to call repeatedly.
create function public.backfill_profile(p_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_user auth.users;
  v_username text;
begin
  if exists (select 1 from public.profiles where id = p_id) then
    return;
  end if;
  select * into v_user from auth.users where id = p_id;
  if v_user.id is null then
    return;
  end if;
  if coalesce(v_user.is_anonymous, false) then
    insert into public.profiles (id, kind, display_name)
    values (p_id, 'anonymous', public.random_display_name());
  else
    v_username := left(coalesce(nullif(trim(v_user.raw_user_meta_data ->> 'username'), ''), split_part(v_user.email, '@', 1)), 30);
    if char_length(v_username) < 2 then v_username := v_username || '_u'; end if;
    insert into public.profiles (id, kind, display_name, username)
    values (p_id, 'registered', v_username, v_username)
    on conflict do nothing;
  end if;
end $$;

create function public.ensure_profile() returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.backfill_profile(public.require_uid());
end $$;

create function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = public
as $$
  select not exists (
    select 1 from public.profiles where lower(username) = lower(trim(p_username))
  )
$$;

create function public.update_display_name(p_name text) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_name text := trim(coalesce(p_name, ''));
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.kind = 'registered' then
    raise exception 'FORBIDDEN';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 30 or v_name ~ '[<>[:cntrl:]]' then
    raise exception 'INVALID_PAYLOAD';
  end if;
  update public.profiles
    set display_name = v_name, kind = 'nickname', updated_at = now()
    where id = v_uid
    returning * into v_profile;
  return jsonb_build_object(
    'id', v_profile.id, 'kind', v_profile.kind, 'displayName', v_profile.display_name
  );
end $$;

-- ---------------------------------------------------------------------------
-- DTO builders (camelCase, matching @omioroom/contracts)
-- ---------------------------------------------------------------------------

create function public.active_seat_count(p_room uuid) returns integer
language sql stable security definer set search_path = public
as $$
  select count(*)::int from public.member_activity
  where room_id = p_room and last_active_at > public.seat_active_cutoff()
$$;

create function public.room_dto(p_room public.rooms) returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', p_room.id,
    'globalId', p_room.global_id,
    'ownerUserId', p_room.owner_id,
    'title', p_room.title,
    'visibility', p_room.visibility,
    'status', p_room.status,
    'createdAt', p_room.created_at,
    'updatedAt', p_room.updated_at,
    'participantCount', public.active_seat_count(p_room.id),
    'maxParticipants', p_room.max_participants,
    'controlMode', p_room.control_mode,
    'revision', p_room.revision
  )
$$;

create function public.playback_dto(p_state public.playback_state) returns jsonb
language sql stable
as $$
  select jsonb_build_object(
    'roomId', p_state.room_id,
    'media', p_state.media,
    'status', p_state.status,
    'anchorPosition', p_state.anchor_position,
    'anchorServerTime', p_state.anchor_server_time,
    'playbackRate', p_state.playback_rate,
    'revision', p_state.revision,
    'updatedByUserId', p_state.updated_by
  )
$$;

create function public.can_control_playback(p_room_id uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select case
      when m.role = 'owner' then true
      when r.control_mode = 'everyone' then true
      when r.control_mode = 'selected' then m.can_control
      else false
    end
    from public.room_members m
    join public.rooms r on r.id = m.room_id
    where m.room_id = p_room_id and m.user_id = p_user
  ), false)
$$;

create function public.build_snapshot(p_room_id uuid, p_viewer uuid) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_room public.rooms;
  v_state public.playback_state;
begin
  select * into v_room from public.rooms where id = p_room_id;
  select * into v_state from public.playback_state where room_id = p_room_id;
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
        'isOnline', coalesce(a.last_active_at > public.seat_active_cutoff(), false)
      ) order by m.joined_at)
      from public.room_members m
      join public.profiles p on p.id = m.user_id
      left join public.member_activity a on a.room_id = m.room_id and a.user_id = m.user_id
      where m.room_id = p_room_id
    ), '[]'::jsonb),
    'playback', case when v_state.room_id is null then null else public.playback_dto(v_state) end
  );
end $$;

-- Authorizes an action inside a room: active room + member.
create function public.assert_active_member(p_room_id uuid, p_user uuid) returns void
language plpgsql stable security definer set search_path = public
as $$
declare v_status text;
begin
  select status into v_status from public.rooms where id = p_room_id;
  if v_status is null then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  if v_status <> 'active' then
    raise exception 'ROOM_CLOSED';
  end if;
  if not exists (select 1 from public.room_members where room_id = p_room_id and user_id = p_user) then
    raise exception 'FORBIDDEN';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Rooms
-- ---------------------------------------------------------------------------

create function public.create_room(
  p_title text default 'Watch Room',
  p_visibility text default 'private',
  p_request_id uuid default null,
  p_max_participants integer default 8,
  p_control_mode text default 'everyone'
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_room public.rooms;
  v_global text;
  v_code text;
  v_result jsonb;
  v_attempt integer := 0;
begin
  if p_request_id is not null then
    select result into v_result from public.idempotency_keys
      where user_id = v_uid and request_id = p_request_id;
    if v_result is not null then
      return v_result;
    end if;
  end if;

  if p_visibility not in ('public', 'private')
     or p_max_participants is null or p_max_participants not between 2 and 32
     or p_control_mode not in ('everyone', 'selected', 'owner') then
    raise exception 'INVALID_PAYLOAD';
  end if;
  v_title := coalesce(v_title, 'Watch Room');
  if char_length(v_title) > 60 then
    raise exception 'INVALID_PAYLOAD';
  end if;

  perform public.check_rate(v_uid, 'create_room', 20, interval '1 hour');

  loop
    v_attempt := v_attempt + 1;
    v_global := (100000 + floor(random() * 900000)::int)::text;
    exit when not exists (select 1 from public.rooms where global_id = v_global and status = 'active');
    if v_attempt >= 50 then
      raise exception 'INTERNAL_ERROR';
    end if;
  end loop;

  insert into public.rooms (global_id, owner_id, title, visibility, max_participants, control_mode)
    values (v_global, v_uid, v_title, p_visibility, p_max_participants, p_control_mode)
    returning * into v_room;

  insert into public.room_members (room_id, user_id, role, can_control) values (v_room.id, v_uid, 'owner', true);
  perform public.mark_active(v_room.id, v_uid);
  insert into public.playback_state (room_id, anchor_server_time) values (v_room.id, public.server_time_ms());

  if p_visibility = 'private' then
    v_code := public.generate_private_code();
    insert into public.room_secrets (room_id, secret_hash) values (v_room.id, public.hash_secret(v_code));
  end if;

  v_result := jsonb_build_object(
    'snapshot', public.build_snapshot(v_room.id, v_uid),
    'ownerAccess', case when v_code is null then null else jsonb_build_object(
      'roomId', v_room.id, 'privateCode', v_code, 'rotatedAt', v_room.created_at
    ) end
  );

  if p_request_id is not null then
    insert into public.idempotency_keys (user_id, request_id, result)
      values (v_uid, p_request_id, v_result)
      on conflict do nothing;
    if random() < 0.02 then
      delete from public.idempotency_keys where created_at < now() - interval '1 day';
    end if;
  end if;
  return v_result;
end $$;

create function public.join_room(p_global_id text, p_private_code text default null) returns jsonb
language plpgsql security definer set search_path = public
as $$
-- Failures are *returned* ({"error": CODE}) instead of raised: a raised exception would roll back
-- the rate_events row and make failed guesses uncounted (room id / code brute force).
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

  select * into v_member from public.room_members where room_id = v_room.id and user_id = v_uid;

  -- Owners and existing members re-enter without the code; everyone else needs it.
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

  -- Seats: at most rooms.max_participants active participants; a returning member must find a free seat too.
  select count(*) into v_active
    from public.member_activity
    where room_id = v_room.id and user_id <> v_uid and last_active_at > public.seat_active_cutoff();
  if v_active >= v_room.max_participants then
    return jsonb_build_object('error', 'ROOM_FULL');
  end if;

  if v_member.user_id is null then
    insert into public.room_members (room_id, user_id, role) values (v_room.id, v_uid, 'member');
  end if;
  perform public.mark_active(v_room.id, v_uid);

  return public.build_snapshot(v_room.id, v_uid);
end $$;

create function public.get_room_snapshot(p_room_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_uid uuid := public.require_uid();
begin
  -- Unknown rooms and rooms the caller is not in look identical.
  if not exists (select 1 from public.room_members where room_id = p_room_id and user_id = v_uid) then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  return public.build_snapshot(p_room_id, v_uid);
end $$;

create function public.touch_room(p_room_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := public.require_uid();
begin
  if exists (select 1 from public.room_members where room_id = p_room_id and user_id = v_uid) then
    perform public.mark_active(p_room_id, v_uid);
  end if;
end $$;

create function public.leave_room(p_room_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := public.require_uid();
begin
  -- Membership stays (the owner and returning guests keep their place); the seat is freed.
  update public.member_activity set last_active_at = to_timestamp(0)
    where room_id = p_room_id and user_id = v_uid;
end $$;

create function public.list_my_rooms() returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(public.room_dto(r) order by r.created_at desc), '[]'::jsonb)
  from public.rooms r
  where r.owner_id = auth.uid() and r.status = 'active'
$$;

-- Loads a room for an owner-only action.
create function public.owned_active_room(p_room_id uuid, p_uid uuid) returns public.rooms
language plpgsql stable security definer set search_path = public
as $$
declare v_room public.rooms;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if v_room.id is null then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  if v_room.owner_id <> p_uid then
    raise exception 'FORBIDDEN';
  end if;
  if v_room.status <> 'active' then
    raise exception 'ROOM_CLOSED';
  end if;
  return v_room;
end $$;

create function public.set_visibility(
  p_room_id uuid,
  p_visibility text,
  p_expected_revision integer default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_room public.rooms;
  v_code text;
begin
  v_room := public.owned_active_room(p_room_id, v_uid);
  if p_visibility not in ('public', 'private') then
    raise exception 'INVALID_PAYLOAD';
  end if;
  if p_expected_revision is not null and v_room.revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT';
  end if;

  if p_visibility = 'private' and v_room.visibility <> 'private' then
    v_code := public.generate_private_code();
    insert into public.room_secrets (room_id, secret_hash)
      values (v_room.id, public.hash_secret(v_code))
      on conflict (room_id) do update
        set secret_hash = excluded.secret_hash, rotated_at = now(), revoked_at = null;
  elsif p_visibility = 'public' and v_room.visibility <> 'public' then
    update public.room_secrets set revoked_at = now() where room_id = v_room.id;
  end if;

  update public.rooms
    set visibility = p_visibility, revision = revision + 1, updated_at = now()
    where id = v_room.id
    returning * into v_room;

  return jsonb_build_object(
    'room', public.room_dto(v_room),
    'ownerAccess', case when v_code is null then null else jsonb_build_object(
      'roomId', v_room.id, 'privateCode', v_code, 'rotatedAt', now()
    ) end
  );
end $$;

-- Owner-only: group size and who controls playback.
create function public.update_room_settings(
  p_room_id uuid,
  p_max_participants integer,
  p_control_mode text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_room public.rooms;
begin
  v_room := public.owned_active_room(p_room_id, v_uid);
  if p_max_participants is null or p_max_participants not between 2 and 32
     or p_control_mode not in ('everyone', 'selected', 'owner') then
    raise exception 'INVALID_PAYLOAD';
  end if;
  -- Never below the number of people currently inside
  if p_max_participants < public.active_seat_count(p_room_id) then
    raise exception 'INVALID_PAYLOAD';
  end if;

  update public.rooms
    set max_participants = p_max_participants, control_mode = p_control_mode,
        revision = revision + 1, updated_at = now()
    where id = v_room.id
    returning * into v_room;
  return public.room_dto(v_room);
end $$;

-- Owner-only: allow/deny one member to control playback (used in 'selected' mode).
create function public.set_member_control(p_room_id uuid, p_user_id uuid, p_can_control boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_room public.rooms;
begin
  v_room := public.owned_active_room(p_room_id, v_uid);
  update public.room_members set can_control = coalesce(p_can_control, false)
    where room_id = v_room.id and user_id = p_user_id and role = 'member';
  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;
end $$;

create function public.rotate_private_code(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_room public.rooms;
  v_code text := public.generate_private_code();
begin
  v_room := public.owned_active_room(p_room_id, v_uid);
  if v_room.visibility <> 'private' then
    raise exception 'INVALID_PAYLOAD';
  end if;

  insert into public.room_secrets (room_id, secret_hash)
    values (v_room.id, public.hash_secret(v_code))
    on conflict (room_id) do update
      set secret_hash = excluded.secret_hash, rotated_at = now(), revoked_at = null;

  update public.rooms set revision = revision + 1, updated_at = now() where id = v_room.id;

  return jsonb_build_object('roomId', v_room.id, 'privateCode', v_code, 'rotatedAt', now());
end $$;

create function public.revoke_private_code(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_room public.rooms;
begin
  v_room := public.owned_active_room(p_room_id, v_uid);
  update public.room_secrets set revoked_at = now() where room_id = v_room.id;
  update public.rooms set revision = revision + 1, updated_at = now()
    where id = v_room.id returning * into v_room;
  return jsonb_build_object('revoked', true, 'revision', v_room.revision);
end $$;

create function public.close_room(p_room_id uuid) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_room public.rooms;
begin
  v_room := public.owned_active_room(p_room_id, v_uid);
  update public.rooms set status = 'closed', revision = revision + 1, updated_at = now()
    where id = v_room.id;
  -- Chat history goes with the room.
  delete from public.chat_messages where room_id = v_room.id;
  return jsonb_build_object('closed', true);
end $$;

-- Rooms nobody has touched for a while are closed (call from a cron/Edge Function).
create function public.close_inactive_rooms(p_max_idle interval default interval '30 minutes')
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_count integer;
begin
  with idle as (
    select r.id
    from public.rooms r
    where r.status = 'active'
      and r.updated_at < now() - p_max_idle
      and not exists (
        select 1 from public.member_activity m
        where m.room_id = r.id and m.last_active_at > now() - p_max_idle
      )
  ), closed as (
    update public.rooms set status = 'closed', revision = revision + 1, updated_at = now()
    where id in (select id from idle)
    returning id
  ), cleared as (
    delete from public.chat_messages where room_id in (select id from closed)
  )
  select count(*) into v_count from closed;
  return v_count;
end $$;

-- Removes anonymous accounts nobody came back to (anonymous sign-ins accumulate otherwise).
-- Accounts that own or sit in an active room are kept. Cascades to profiles and their data.
create function public.cleanup_stale_anonymous_users(p_max_age interval default interval '30 days')
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_count integer;
begin
  with doomed as (
    select u.id
    from auth.users u
    where coalesce(u.is_anonymous, false)
      and coalesce(u.last_sign_in_at, u.created_at) < now() - p_max_age
      and not exists (select 1 from public.rooms r where r.owner_id = u.id and r.status = 'active')
      and not exists (
        select 1 from public.room_members m
        join public.rooms r on r.id = m.room_id and r.status = 'active'
        where m.user_id = u.id
      )
  ), removed as (
    delete from auth.users where id in (select id from doomed) returning id
  )
  select count(*) into v_count from removed;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- Playback (authoritative state, revisions, command dedup)
-- ---------------------------------------------------------------------------

create function public.expected_position(p_state public.playback_state, p_now bigint) returns double precision
language sql immutable
as $$
  select case
    when p_state.status <> 'playing' then p_state.anchor_position
    else p_state.anchor_position
         + greatest(0, (p_now - p_state.anchor_server_time)::double precision / 1000.0) * p_state.playback_rate
  end
$$;

create function public.player_command(
  p_room_id uuid,
  p_command_id uuid,
  p_type text,
  p_position double precision default null,
  p_media jsonb default null,
  p_playback_rate double precision default null,
  p_expected_revision integer default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_state public.playback_state;
  v_now bigint;
  v_status text;
  v_pos double precision;
  v_rate double precision;
  v_media jsonb;
begin
  perform public.assert_active_member(p_room_id, v_uid);
  if not public.can_control_playback(p_room_id, v_uid) then
    raise exception 'FORBIDDEN';
  end if;

  if p_type not in ('play', 'pause', 'seek', 'change-media', 'set-rate', 'buffering') then
    raise exception 'INVALID_PAYLOAD';
  end if;
  if p_position is not null and p_position < 0 then
    raise exception 'INVALID_PAYLOAD';
  end if;

  -- Row lock gives every room a deterministic command order.
  select * into v_state from public.playback_state where room_id = p_room_id for update;
  if v_state.room_id is null then
    insert into public.playback_state (room_id, anchor_server_time)
      values (p_room_id, public.server_time_ms())
      returning * into v_state;
  end if;

  perform public.mark_active(p_room_id, v_uid);

  -- Duplicate delivery of the same command never applies twice.
  if exists (select 1 from public.processed_commands where room_id = p_room_id and command_id = p_command_id) then
    return public.playback_dto(v_state);
  end if;

  -- A command based on an older revision must not overwrite newer state.
  if p_expected_revision is not null and p_expected_revision < v_state.revision then
    return public.playback_dto(v_state);
  end if;

  v_now := public.server_time_ms();
  v_status := v_state.status;
  v_pos := v_state.anchor_position;
  v_rate := v_state.playback_rate;
  v_media := v_state.media;

  if p_type = 'play' then
    v_status := 'playing';
    v_pos := coalesce(p_position, public.expected_position(v_state, v_now));
  elsif p_type = 'pause' then
    v_status := 'paused';
    v_pos := coalesce(p_position, public.expected_position(v_state, v_now));
  elsif p_type = 'seek' then
    v_pos := coalesce(p_position, 0);
  elsif p_type = 'buffering' then
    v_status := 'buffering';
    v_pos := coalesce(p_position, public.expected_position(v_state, v_now));
  elsif p_type = 'set-rate' then
    if p_playback_rate is null or p_playback_rate < 0.25 or p_playback_rate > 3 then
      raise exception 'INVALID_PAYLOAD';
    end if;
    v_pos := public.expected_position(v_state, v_now);
    v_rate := p_playback_rate;
  elsif p_type = 'change-media' then
    if p_media is null
       or coalesce(p_media ->> 'type', '') not in ('youtube','html5','vk','rutube','twitch','vimeo','hls')
       or coalesce(p_media ->> 'sourceId', '') = ''
       or coalesce(p_media ->> 'canonicalUrl', '') !~* '^https?://' then
      raise exception 'MEDIA_UNSUPPORTED';
    end if;
    v_media := jsonb_build_object(
      'type', p_media ->> 'type',
      'sourceId', p_media ->> 'sourceId',
      'canonicalUrl', p_media ->> 'canonicalUrl'
    );
    v_pos := 0;
    v_status := 'paused';
  end if;

  update public.playback_state set
    media = v_media,
    status = v_status,
    anchor_position = v_pos,
    anchor_server_time = v_now,
    playback_rate = v_rate,
    revision = revision + 1,
    updated_by = v_uid
  where room_id = p_room_id
  returning * into v_state;

  insert into public.processed_commands (room_id, command_id) values (p_room_id, p_command_id);
  if random() < 0.02 then
    delete from public.processed_commands where created_at < now() - interval '1 day';
  end if;

  return public.playback_dto(v_state);
end $$;

-- ---------------------------------------------------------------------------
-- Chat
-- ---------------------------------------------------------------------------

create function public.send_chat(
  p_room_id uuid,
  p_text text default '',
  p_attachment_url text default null,
  p_attachment_type text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_text text := trim(coalesce(p_text, ''));
  v_url text := nullif(trim(coalesce(p_attachment_url, '')), '');
  v_name text;
  v_msg public.chat_messages;
begin
  perform public.assert_active_member(p_room_id, v_uid);
  perform public.check_rate(v_uid, 'chat', 15, interval '10 seconds');

  if char_length(v_text) > 1000 then
    raise exception 'INVALID_PAYLOAD';
  end if;
  if v_text = '' and v_url is null then
    raise exception 'INVALID_PAYLOAD';
  end if;
  if v_url is not null then
    if char_length(v_url) > 2048 or v_url !~* '^https?://[^[:space:]]+$' then
      raise exception 'INVALID_PAYLOAD';
    end if;
    if p_attachment_type is null or p_attachment_type not in ('image', 'file') then
      raise exception 'INVALID_PAYLOAD';
    end if;
  end if;

  select display_name into v_name from public.profiles where id = v_uid;

  insert into public.chat_messages (room_id, sender_id, sender_name, body, attachment_url, attachment_type)
    values (p_room_id, v_uid, v_name, v_text, v_url, case when v_url is null then null else p_attachment_type end)
    returning * into v_msg;

  -- Keep only the last 100 messages per room.
  delete from public.chat_messages
    where room_id = p_room_id
      and id in (
        select id from public.chat_messages
        where room_id = p_room_id
        order by created_at desc, id desc
        offset 100
      );

  return jsonb_build_object(
    'id', v_msg.id, 'roomId', v_msg.room_id, 'senderId', v_msg.sender_id,
    'senderName', v_msg.sender_name, 'text', v_msg.body,
    'attachmentUrl', v_msg.attachment_url, 'attachmentType', v_msg.attachment_type,
    'createdAt', v_msg.created_at
  );
end $$;

-- ---------------------------------------------------------------------------
-- Friends (registered accounts only)
-- ---------------------------------------------------------------------------

create function public.assert_registered(p_uid uuid) returns void
language plpgsql stable security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = p_uid and kind = 'registered') then
    raise exception 'FORBIDDEN';
  end if;
end $$;

create function public.list_friends() returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_uid uuid := public.require_uid();
begin
  perform public.assert_registered(v_uid);
  return coalesce((
    select jsonb_agg(jsonb_build_object('userId', p.id, 'displayName', p.display_name) order by p.display_name)
    from public.friendships f
    join public.profiles p on p.id = f.friend_id
    where f.user_id = v_uid
  ), '[]'::jsonb);
end $$;

create function public.add_friend(p_username text) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_target public.profiles;
begin
  perform public.assert_registered(v_uid);
  perform public.check_rate(v_uid, 'add_friend', 30, interval '1 hour');

  select * into v_target from public.profiles
    where lower(username) = lower(trim(coalesce(p_username, ''))) and kind = 'registered';
  if v_target.id is null then
    return jsonb_build_object('error', 'USER_NOT_FOUND');
  end if;
  if v_target.id = v_uid then
    raise exception 'INVALID_PAYLOAD';
  end if;

  insert into public.friendships (user_id, friend_id) values (v_uid, v_target.id) on conflict do nothing;
  insert into public.friendships (user_id, friend_id) values (v_target.id, v_uid) on conflict do nothing;
  return jsonb_build_object('userId', v_target.id, 'displayName', v_target.display_name);
end $$;

create function public.remove_friend(p_user_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := public.require_uid();
begin
  perform public.assert_registered(v_uid);
  delete from public.friendships
    where (user_id = v_uid and friend_id = p_user_id) or (user_id = p_user_id and friend_id = v_uid);
end $$;

-- ---------------------------------------------------------------------------
-- Row level security: read-only for members; every write goes through RPC
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.rooms enable row level security;
alter table public.room_secrets enable row level security;
alter table public.room_members enable row level security;
alter table public.playback_state enable row level security;
alter table public.processed_commands enable row level security;
alter table public.chat_messages enable row level security;
alter table public.member_activity enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.rate_events enable row level security;

create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_room_with(id) or public.is_friend_of(id));

create policy friendships_read on public.friendships for select to authenticated
  using (user_id = auth.uid());

create policy rooms_read on public.rooms for select to authenticated
  using (owner_id = auth.uid() or public.is_room_member(id));

create policy room_members_read on public.room_members for select to authenticated
  using (public.is_room_member(room_id));

create policy playback_read on public.playback_state for select to authenticated
  using (public.is_room_member(room_id));

create policy chat_read on public.chat_messages for select to authenticated
  using (public.is_room_member(room_id));

-- Internal tables: no policies => no client access. Also drop table privileges.
revoke all on public.room_secrets, public.processed_commands, public.idempotency_keys, public.rate_events,
  public.member_activity
  from anon, authenticated;
-- Clients never write tables directly.
revoke insert, update, delete, truncate on
  public.profiles, public.friendships, public.rooms, public.room_members,
  public.playback_state, public.chat_messages
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Function privileges: callable by signed-in users only (anonymous sign-in
-- users are "authenticated"). Internal helpers are not exposed.
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.server_time_ms(),
  public.ensure_profile(),
  public.update_display_name(text),
  public.create_room(text, text, uuid, integer, text),
  public.update_room_settings(uuid, integer, text),
  public.set_member_control(uuid, uuid, boolean),
  public.join_room(text, text),
  public.get_room_snapshot(uuid),
  public.touch_room(uuid),
  public.leave_room(uuid),
  public.list_my_rooms(),
  public.set_visibility(uuid, text, integer),
  public.rotate_private_code(uuid),
  public.revoke_private_code(uuid),
  public.close_room(uuid),
  public.player_command(uuid, uuid, text, double precision, jsonb, double precision, integer),
  public.send_chat(uuid, text, text, text),
  public.list_friends(),
  public.add_friend(text),
  public.remove_friend(uuid)
to authenticated;

-- RLS policies call these helpers on behalf of the signed-in role.
grant execute on function
  public.is_room_member(uuid),
  public.shares_room_with(uuid),
  public.is_friend_of(uuid)
to authenticated;

-- Sign-up form checks username availability before the user exists.
grant execute on function public.username_available(text) to anon, authenticated;

-- close_inactive_rooms is for service_role / scheduled jobs only (not granted to clients).

-- ---------------------------------------------------------------------------
-- Realtime: clients subscribe to row changes; RLS decides who receives what.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.playback_state, public.chat_messages, public.room_members, public.rooms;
  end if;
end $$;

alter table public.playback_state replica identity full;
alter table public.rooms replica identity full;

-- Profiles for users that already exist (e.g. anonymous sign-ins made before this migration ran).
select public.backfill_profile(id) from auth.users;
