-- Input hygiene. All database access already goes through parameterised functions and Row Level Security
-- (no query is ever built from user text), so injection is not possible; this adds a second line of defence:
-- hidden control characters, direction overrides and punctuation that has no business in names are refused.

-- No control characters, zero-width characters or bidirectional overrides (they hide text and spoof names)
create function public.is_clean_text(p text) returns boolean
language sql immutable set search_path = public
as $$
  select p is null or p !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f​-‏‪-‮⁠-⁤﻿]'
$$;

-- Names: letters, digits, spaces, dot, hyphen and underscore only
create function public.is_safe_name(p text) returns boolean
language sql immutable set search_path = public
as $$
  select p is not null
     and public.is_clean_text(p)
     and p !~ '[!-,/:-@[-^`{-~]'
$$;

-- Names given by the user (nickname change)
create or replace function public.update_display_name(p_name text) returns jsonb
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
  if char_length(v_name) < 2 or char_length(v_name) > 30 or not public.is_safe_name(v_name) then
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

-- Registration: a username that is sent explicitly must be clean (a crafted one is refused);
-- a name derived from the e-mail address is cleaned instead, so odd addresses still work
create or replace function public.handle_auth_user() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_given text;
  v_username text;
begin
  if tg_op = 'INSERT' and coalesce(new.is_anonymous, false) then
    insert into public.profiles (id, kind, display_name)
    values (new.id, 'anonymous', public.random_display_name());
    return new;
  end if;

  if tg_op = 'INSERT' or (coalesce(old.is_anonymous, false) and not coalesce(new.is_anonymous, false)) then
    v_given := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
    if v_given is not null then
      if char_length(v_given) < 2 or char_length(v_given) > 30 or not public.is_safe_name(v_given) then
        raise exception 'INVALID_PAYLOAD';
      end if;
      v_username := v_given;
    else
      v_username := left(regexp_replace(split_part(new.email, '@', 1), '[^[:alnum:]._-]', '_', 'g'), 30);
      if char_length(v_username) < 2 then v_username := v_username || '_u'; end if;
    end if;

    if tg_op = 'INSERT' then
      insert into public.profiles (id, kind, display_name, username)
      values (new.id, 'registered', v_username, v_username);
    else
      update public.profiles
        set kind = 'registered', username = v_username, display_name = v_username, updated_at = now()
        where id = new.id;
    end if;
  end if;
  return new;
end $$;

-- Chat text and names in the chat
create function public.validate_chat_message() returns trigger
language plpgsql set search_path = public
as $$
begin
  if not public.is_clean_text(new.body) or not public.is_clean_text(new.sender_name) then
    raise exception 'INVALID_PAYLOAD';
  end if;
  return new;
end $$;
create trigger chat_messages_validate before insert on public.chat_messages
  for each row execute function public.validate_chat_message();

-- Video links: bounded length, no whitespace or hidden characters
create function public.validate_playback_media() returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.media is not null and (
       char_length(coalesce(new.media ->> 'canonicalUrl', '')) > 2048
       or char_length(coalesce(new.media ->> 'sourceId', '')) > 512
       or coalesce(new.media ->> 'canonicalUrl', '') ~ '\s'
       or not public.is_clean_text(new.media ->> 'canonicalUrl')
       or not public.is_clean_text(new.media ->> 'sourceId')
     ) then
    raise exception 'MEDIA_UNSUPPORTED';
  end if;
  return new;
end $$;
create trigger playback_state_validate_media before insert or update of media on public.playback_state
  for each row execute function public.validate_playback_media();
