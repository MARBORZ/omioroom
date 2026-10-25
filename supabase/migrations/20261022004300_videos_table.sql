-- Catalogue of the videos the admin uploads to Storage: one row per file with its title, size, duration,
-- creation time and preview image. The files themselves live in the public "videos" bucket, previews in
-- the public "video-thumbnails" bucket. Only admins can read or change the table (the room picker is admin-only).

create table public.videos (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  storage_path text not null unique check (char_length(storage_path) between 1 and 300),
  mime_type text not null check (mime_type in ('video/mp4', 'video/webm')),
  size_bytes bigint not null check (size_bytes > 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  thumbnail_path text check (thumbnail_path is null or char_length(thumbnail_path) <= 300),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index videos_created_at_idx on public.videos (created_at desc);

alter table public.videos enable row level security;
create policy videos_admin_all on public.videos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.videos from anon;

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present: skipping thumbnails bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('video-thumbnails', 'video-thumbnails', true, 2097152, array['image/jpeg', 'image/webp'])
  on conflict (id) do update
    set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/webp'];

  execute $p$
    create policy video_thumbnails_admin_select on storage.objects for select to authenticated
    using (bucket_id = 'video-thumbnails' and public.is_admin())
  $p$;
  execute $p$
    create policy video_thumbnails_admin_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'video-thumbnails' and public.is_admin())
  $p$;
  execute $p$
    create policy video_thumbnails_admin_update on storage.objects for update to authenticated
    using (bucket_id = 'video-thumbnails' and public.is_admin())
    with check (bucket_id = 'video-thumbnails' and public.is_admin())
  $p$;
  execute $p$
    create policy video_thumbnails_admin_delete on storage.objects for delete to authenticated
    using (bucket_id = 'video-thumbnails' and public.is_admin())
  $p$;
end $$;
