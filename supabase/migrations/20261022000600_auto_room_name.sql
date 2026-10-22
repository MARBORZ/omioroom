-- Rooms are named automatically unless a title is passed (the UI no longer asks for one).
create function public.random_room_name() returns text
language plpgsql volatile set search_path = public
as $$
declare
  moods text[] := array['Cozy','Late','Sunday','Midnight','Golden','Lazy','Rainy','Friday','Quiet','Lucky'];
  things text[] := array['Cinema','Screening','Session','Marathon','Premiere','Lounge','Club','Matinee','Night','Double Feature'];
begin
  return moods[1 + floor(random() * 10)::int] || ' ' || things[1 + floor(random() * 10)::int];
end $$;
revoke execute on function public.random_room_name() from public, anon, authenticated;

drop function public.create_room(text, text, uuid, integer, text);

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
