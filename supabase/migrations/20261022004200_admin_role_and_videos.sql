-- Admin role + a public "videos" bucket the admin uploads full films/series into.
-- Direct media (HTML5 / HLS links, including videos from that bucket) is now gated by the admin role
-- instead of the display name "Mar", which anyone could pick for themselves.

alter table public.profiles add column role text not null default 'user' check (role in ('user', 'admin'));

-- Clients never write profiles directly (all writes go through SECURITY DEFINER RPCs that do not touch
-- role), so the role can only be granted from the SQL editor / service role. The registered account
-- with username "mar" becomes the first admin; grant others with:
--   update public.profiles set role = 'admin' where id = '<user uuid>';
update public.profiles set role = 'admin' where lower(username) = 'mar';

create function public.is_admin(p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = p_user and role = 'admin')
$$;
revoke execute on function public.is_admin(uuid) from public, anon;
grant execute on function public.is_admin(uuid) to authenticated;

-- The role must not be changeable through any client-reachable path, even if a policy is added later.
create function public.profiles_protect_role() returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null then
    raise exception 'FORBIDDEN';
  end if;
  return new;
end $$;
create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.profiles_protect_role();

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

  -- Only a media CHANGE needs the admin; everyone in the room may still pause/seek what the admin started.
  if v_type in ('html5', 'hls')
     and (tg_op = 'INSERT' or new.media is distinct from old.media)
     and not public.direct_media_allowed()
     and not public.is_admin(new.updated_by) then
    raise exception 'MEDIA_UNSUPPORTED';
  end if;

  v_ok := case v_type
    when 'youtube' then v_url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$'
                        and v_id = substring(v_url from 'v=([A-Za-z0-9_-]{11})$')
    when 'vk' then v_url ~ '^https://(vk\.com|vkvideo\.ru)/video_ext\.php\?oid=-?[0-9]+&id=[0-9]+(&hash=[A-Za-z0-9]+)?&autoplay=0$'
    when 'rutube' then v_url ~ '^https://rutube\.ru/play/embed/[a-f0-9]{32}(\?p=[A-Za-z0-9%_.~-]+)?$'
    when 'vimeo' then v_url ~ '^https://player\.vimeo\.com/video/[0-9]+(\?h=[a-f0-9]+)?$'
    when 'kodik' then v_url ~* '^https://([a-zA-Z0-9-]+\.)*(kodik\.info|kodikplayer\.com|aniqit\.com|anivod\.com|kodik\.biz|kodik\.cc)/(video|seria|serial)/[0-9]+/[a-zA-Z0-9]+(/[a-zA-Z0-9]+)?(\?[^#\s]*)?$'
    when 'html5' then v_url ~* '^https?://[^/]+/'
    when 'hls' then v_url ~* '^https?://[^/]+/'
    else false
  end;
  if not coalesce(v_ok, false) then
    raise exception 'MEDIA_UNSUPPORTED';
  end if;

  select visibility into v_visibility from public.rooms where id = new.room_id;
  if v_visibility = 'public' then
    if tg_op = 'UPDATE' and new.media is distinct from old.media and new.updated_by is not null
       and (select count(*) from public.moderation_events
            where user_id = new.updated_by and kind = 'media_blocked' and created_at > now() - interval '24 hours') >= 3 then
      raise exception 'MEDIA_COOLDOWN';
    end if;
  end if;
  return new;
end $$;

-- Storage: public-read bucket (the browser <video> tag needs Range requests / 206 without auth headers);
-- only admins may upload, replace or delete. Skipped where the Storage schema does not exist.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present: skipping videos bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, allowed_mime_types)
  values ('videos', 'videos', true, array['video/mp4', 'video/webm'])
  on conflict (id) do update
    set public = true, allowed_mime_types = array['video/mp4', 'video/webm'];

  execute $p$
    create policy videos_admin_select on storage.objects for select to authenticated
    using (bucket_id = 'videos' and public.is_admin())
  $p$;
  execute $p$
    create policy videos_admin_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'videos' and public.is_admin())
  $p$;
  execute $p$
    create policy videos_admin_update on storage.objects for update to authenticated
    using (bucket_id = 'videos' and public.is_admin())
    with check (bucket_id = 'videos' and public.is_admin())
  $p$;
  execute $p$
    create policy videos_admin_delete on storage.objects for delete to authenticated
    using (bucket_id = 'videos' and public.is_admin())
  $p$;
end $$;
