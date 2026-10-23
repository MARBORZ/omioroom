-- Automatic moderation of videos in open rooms.
-- When a video is set in an open room, an Edge Function (moderate-media) looks up its title and age flags at
-- the platform and checks the title against a list of blocked terms. A video that fails is removed from the room,
-- the room is told why (playback.mediaBlocked) and the person who set it gets a strike; three strikes in 24 hours
-- stop that person from changing videos in open rooms for the rest of the day. Private rooms are not moderated.

alter table public.playback_state add column media_blocked text;

create or replace function public.playback_dto(p_state public.playback_state) returns jsonb
language sql stable set search_path = public
as $$
  select jsonb_build_object(
    'roomId', p_state.room_id,
    'media', p_state.media,
    'status', p_state.status,
    'anchorPosition', p_state.anchor_position,
    'anchorServerTime', p_state.anchor_server_time,
    'playbackRate', p_state.playback_rate,
    'revision', p_state.revision,
    'updatedByUserId', p_state.updated_by,
    'bufferingBy', coalesce((select jsonb_agg(k) from jsonb_object_keys(p_state.buffering) as k), '[]'::jsonb),
    'mediaBlocked', p_state.media_blocked
  )
$$;

-- A new video clears the previous "blocked" note
create function public.clear_media_blocked() returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.media is not null and new.media is distinct from old.media then
    new.media_blocked := null;
  end if;
  return new;
end $$;
create trigger playback_state_clear_blocked before update of media on public.playback_state
  for each row execute function public.clear_media_blocked();

-- ---------------------------------------------------------------------------
-- Blocked terms
-- ---------------------------------------------------------------------------

create table public.blocked_terms (
  term text primary key,
  -- 'word': the term must stand as a whole word; 'substring': found anywhere in the title
  mode text not null default 'word' check (mode in ('word', 'substring')),
  kind text not null default 'adult'
);
alter table public.blocked_terms enable row level security;
revoke all on public.blocked_terms from anon, authenticated;

insert into public.blocked_terms (term, mode, kind) values
  ('porn', 'substring', 'adult'), ('porno', 'substring', 'adult'), ('pornhub', 'substring', 'adult'),
  ('xxx', 'word', 'adult'), ('nsfw', 'word', 'adult'), ('hentai', 'substring', 'adult'),
  ('erotic', 'substring', 'adult'), ('erotica', 'substring', 'adult'), ('onlyfans', 'substring', 'adult'),
  ('nude', 'word', 'adult'), ('nudes', 'word', 'adult'), ('naked', 'word', 'adult'), ('sex', 'word', 'adult'),
  ('sexy', 'word', 'adult'), ('blowjob', 'substring', 'adult'), ('handjob', 'substring', 'adult'),
  ('orgasm', 'substring', 'adult'), ('milf', 'word', 'adult'), ('fetish', 'substring', 'adult'),
  ('bdsm', 'word', 'adult'), ('camgirl', 'substring', 'adult'), ('striptease', 'substring', 'adult'),
  ('18+', 'word', 'adult'), ('21+', 'word', 'adult'), ('adults only', 'substring', 'adult'),
  ('gore', 'word', 'violence'), ('snuff', 'word', 'violence'), ('beheading', 'substring', 'violence'),
  ('порно', 'substring', 'adult'), ('порнух', 'substring', 'adult'), ('секс', 'word', 'adult'),
  ('эротик', 'substring', 'adult'), ('эротич', 'substring', 'adult'), ('хентай', 'substring', 'adult'),
  ('голые', 'word', 'adult'), ('голая', 'word', 'adult'), ('голый', 'word', 'adult'),
  ('обнажен', 'substring', 'adult'), ('интим', 'word', 'adult'), ('минет', 'word', 'adult'),
  ('камшот', 'substring', 'adult'), ('вебкам', 'substring', 'adult'), ('стриптиз', 'substring', 'adult'),
  ('для взрослых', 'substring', 'adult'), ('только для взрослых', 'substring', 'adult'),
  ('расчленен', 'substring', 'violence'), ('обезглавл', 'substring', 'violence'), ('зоофил', 'substring', 'adult');

create function public.normalize_title(p text) returns text
language sql immutable set search_path = public
as $$
  select regexp_replace(lower(replace(replace(coalesce(p, ''), 'Ё', 'е'), 'ё', 'е')), '[_./\\|\-]+', ' ', 'g')
$$;

-- The first blocked term found in a text, or null
create function public.find_blocked_term(p_text text) returns text
language sql stable security definer set search_path = public
as $$
  select t.term
  from public.blocked_terms t
  where case t.mode
          when 'substring' then public.normalize_title(p_text) like '%' || t.term || '%'
          else public.normalize_title(p_text) ~ ('(^|[^[:alnum:]])' || regexp_replace(t.term, '([.+*?()\[\]{}|\\^$-])', '\\\1', 'g') || '($|[^[:alnum:]])')
        end
  limit 1
$$;
revoke execute on function public.find_blocked_term(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Verdicts, strikes and removal
-- ---------------------------------------------------------------------------

create table public.media_verdicts (
  media_key text primary key,        -- '<type>:<sourceId>'
  title text,
  verdict text not null check (verdict in ('ok', 'blocked', 'unknown')),
  reason text,
  checked_at timestamptz not null default now()
);
alter table public.media_verdicts enable row level security;
revoke all on public.media_verdicts from anon, authenticated;

create table public.moderation_events (
  id bigserial primary key,
  room_id uuid references public.rooms (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  kind text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index moderation_events_user_idx on public.moderation_events (user_id, kind, created_at desc);
alter table public.moderation_events enable row level security;
revoke all on public.moderation_events from anon, authenticated;

create function public.media_key_of(p_media jsonb) returns text
language sql immutable
as $$ select (p_media ->> 'type') || ':' || (p_media ->> 'sourceId') $$;

-- Removes the video from the room if it is still the one that was judged
create function public.reject_media(p_room_id uuid, p_media_key text, p_reason text) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_state public.playback_state;
begin
  select * into v_state from public.playback_state where room_id = p_room_id for update;
  if v_state.room_id is null or v_state.media is null or public.media_key_of(v_state.media) <> p_media_key then
    return false;
  end if;
  update public.playback_state set
    media = null, status = 'paused', anchor_position = 0, anchor_server_time = public.server_time_ms(),
    buffering = '{}'::jsonb, resume_after_buffer = false, media_blocked = p_reason, revision = revision + 1
    where room_id = p_room_id;
  insert into public.moderation_events (room_id, user_id, kind, detail)
    values (p_room_id, v_state.updated_by, 'media_blocked', p_reason);
  return true;
end $$;
revoke execute on function public.reject_media(uuid, text, text) from public, anon, authenticated;

-- Called by the Edge Function with what it learned about the video
create function public.record_media_verdict(
  p_room_id uuid, p_media_key text, p_title text, p_verdict text, p_reason text
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_term text;
begin
  if p_verdict = 'ok' then
    v_term := public.find_blocked_term(p_title);
    if v_term is not null then
      p_verdict := 'blocked';
      p_reason := 'title';
    end if;
  end if;
  insert into public.media_verdicts (media_key, title, verdict, reason)
    values (p_media_key, left(p_title, 300), p_verdict, p_reason)
    on conflict (media_key) do update
      set title = excluded.title, verdict = excluded.verdict, reason = excluded.reason, checked_at = now();
  if p_verdict = 'blocked' then
    return public.reject_media(p_room_id, p_media_key, p_reason);
  end if;
  return false;
end $$;
revoke execute on function public.record_media_verdict(uuid, text, text, text, text) from public, anon, authenticated;

-- After a video is set in an open room: use a known verdict, or ask the Edge Function to look it up
create function public.request_media_check() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_key text;
  v_visibility text;
  v_cached public.media_verdicts;
  v_secret text;
begin
  if new.media is null or new.media is not distinct from old.media then
    return new;
  end if;
  select visibility into v_visibility from public.rooms where id = new.room_id;
  if v_visibility is distinct from 'public' then
    return new;
  end if;

  v_key := public.media_key_of(new.media);
  select * into v_cached from public.media_verdicts where media_key = v_key and checked_at > now() - interval '7 days';
  if v_cached.media_key is not null then
    if v_cached.verdict = 'blocked' then
      perform public.reject_media(new.room_id, v_key, v_cached.reason);
    end if;
    return new;
  end if;

  if to_regnamespace('net') is not null and to_regclass('vault.decrypted_secrets') is not null then
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cleanup_secret';
    perform net.http_post(
      url := 'https://dmpmwcxohniwfczkoxkk.supabase.co/functions/v1/moderate-media',
      headers := jsonb_build_object('content-type', 'application/json', 'x-cleanup-secret', coalesce(v_secret, '')),
      body := jsonb_build_object(
        'roomId', new.room_id, 'type', new.media ->> 'type', 'sourceId', new.media ->> 'sourceId',
        'url', new.media ->> 'canonicalUrl'
      )
    );
  end if;
  return new;
end $$;
create trigger playback_state_request_media_check after update of media on public.playback_state
  for each row execute function public.request_media_check();

-- Three removed videos within 24 hours: no changing videos in open rooms until the strikes age out
create or replace function public.validate_playback_media() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_url text := coalesce(new.media ->> 'canonicalUrl', '');
  v_id text := coalesce(new.media ->> 'sourceId', '');
  v_type text := new.media ->> 'type';
  v_visibility text;
  v_ok boolean;
begin
  if new.media is null then
    return new;
  end if;

  if char_length(v_url) > 2048 or char_length(v_id) > 512 or v_url ~ '\s'
     or not public.is_clean_text(v_url) or not public.is_clean_text(v_id) then
    raise exception 'MEDIA_UNSUPPORTED';
  end if;

  v_ok := case v_type
    when 'youtube' then v_url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$'
                        and v_id = substring(v_url from 'v=([A-Za-z0-9_-]{11})$')
    when 'vk' then v_url ~ '^https://(vk\.com|vkvideo\.ru)/video_ext\.php\?oid=-?[0-9]+&id=[0-9]+(&hash=[A-Za-z0-9]+)?&autoplay=0$'
    when 'rutube' then v_url ~ '^https://rutube\.ru/play/embed/[a-f0-9]{32}(\?p=[A-Za-z0-9%_.~-]+)?$'
    when 'vimeo' then v_url ~ '^https://player\.vimeo\.com/video/[0-9]+(\?h=[a-f0-9]+)?$'
    when 'html5' then v_url ~* '^https?://[^/]+/'
    when 'hls' then v_url ~* '^https?://[^/]+/'
    else false
  end;
  if not coalesce(v_ok, false) then
    raise exception 'MEDIA_UNSUPPORTED';
  end if;

  select visibility into v_visibility from public.rooms where id = new.room_id;
  if v_visibility = 'public' then
    if v_type in ('html5', 'hls') and public.open_rooms_platforms_only() then
      raise exception 'MEDIA_NOT_ALLOWED_IN_OPEN_ROOM';
    end if;
    if tg_op = 'UPDATE' and new.media is distinct from old.media and new.updated_by is not null
       and (select count(*) from public.moderation_events
            where user_id = new.updated_by and kind = 'media_blocked' and created_at > now() - interval '24 hours') >= 3 then
      raise exception 'MEDIA_COOLDOWN';
    end if;
  end if;
  return new;
end $$;
