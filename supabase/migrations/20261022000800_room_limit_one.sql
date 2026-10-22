-- One active room per owner for now. The limit lives in this single function: raise it here later.
create or replace function public.room_limit_per_user() returns integer
language sql immutable set search_path = public
as $$ select 1 $$;
