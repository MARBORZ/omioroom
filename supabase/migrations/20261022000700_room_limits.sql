-- Limits: at most 3 active rooms per owner; a room nobody is in closes itself after 5 minutes.

create function public.room_limit_per_user() returns integer
language sql immutable set search_path = public
as $$ select 3 $$;
revoke execute on function public.room_limit_per_user() from public, anon;
grant execute on function public.room_limit_per_user() to authenticated;

create or replace function public.create_room(
  p_title text default null,
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
  v_title := coalesce(v_title, public.random_room_name());
  if char_length(v_title) > 60 then
    raise exception 'INVALID_PAYLOAD';
  end if;

  perform public.check_rate(v_uid, 'create_room', 20, interval '1 hour');

  -- At most N active rooms per owner; closing one frees a slot
  if (select count(*) from public.rooms where owner_id = v_uid and status = 'active') >= public.room_limit_per_user() then
    return jsonb_build_object('error', 'ROOM_LIMIT');
  end if;

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

revoke execute on function public.create_room(text, text, uuid, integer, text) from public, anon;
grant execute on function public.create_room(text, text, uuid, integer, text) to authenticated;

-- "Empty since" is tracked on the room itself, so the 5 minutes count from the moment the last seat
-- expired no matter how people left (button, closed tab, lost connection).
alter table public.rooms add column empty_since timestamptz;

-- Marks rooms that became empty, clears rooms that got someone back, and closes rooms that stayed
-- empty for p_max_idle (default 5 minutes). Runs every minute.
create or replace function public.close_inactive_rooms(p_max_idle interval default interval '5 minutes')
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_count integer;
begin
  -- Someone is (back) inside: the clock stops
  update public.rooms r set empty_since = null
  where r.status = 'active' and r.empty_since is not null
    and exists (
      select 1 from public.member_activity m
      where m.room_id = r.id and m.last_active_at > public.seat_active_cutoff()
    );

  -- Nobody inside and not yet marked: the clock starts
  update public.rooms r set empty_since = now()
  where r.status = 'active' and r.empty_since is null
    and not exists (
      select 1 from public.member_activity m
      where m.room_id = r.id and m.last_active_at > public.seat_active_cutoff()
    );

  with closed as (
    update public.rooms set status = 'closed', revision = revision + 1, updated_at = now()
    where status = 'active' and empty_since is not null and empty_since < now() - p_max_idle
    returning id
  ), cleared as (
    delete from public.chat_messages where room_id in (select id from closed)
  )
  select count(*) into v_count from closed;
  return v_count;
end $$;
revoke execute on function public.close_inactive_rooms(interval) from public, anon, authenticated;

-- Run the check every minute
do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule('omioroom-close-inactive-rooms');
    perform cron.schedule(
      'omioroom-close-inactive-rooms',
      '* * * * *',
      $job$ select public.close_inactive_rooms(interval '5 minutes') $job$
    );
  end if;
exception when others then
  raise notice 'could not reschedule cron job: %', sqlerrm;
end $$;
