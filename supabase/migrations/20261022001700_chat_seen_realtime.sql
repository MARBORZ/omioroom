-- Read receipts update live: members may read their room's chat_seen rows and receive their changes.
grant select on public.chat_seen to authenticated;
create policy chat_seen_read on public.chat_seen for select to authenticated
  using (public.is_room_member(room_id));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_seen'
     ) then
    alter publication supabase_realtime add table public.chat_seen;
  end if;
end $$;
