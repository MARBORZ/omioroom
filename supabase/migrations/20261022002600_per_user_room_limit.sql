-- Active rooms per owner: 1 by default, a different number for chosen accounts (table user_room_limits).
create table public.user_room_limits (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  max_rooms integer not null check (max_rooms between 1 and 50)
);
alter table public.user_room_limits enable row level security;
revoke all on public.user_room_limits from anon, authenticated;

create function public.room_limit_for(p_user uuid) returns integer
language sql stable security definer set search_path = public
as $$ select coalesce((select max_rooms from public.user_room_limits where user_id = p_user), 1) $$;
revoke execute on function public.room_limit_for(uuid) from public, anon, authenticated;

create or replace function public.room_limit_per_user() returns integer
language sql stable security definer set search_path = public
as $$ select public.room_limit_for(auth.uid()) $$;
