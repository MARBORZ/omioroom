-- Rooms are identified by their number only; the title column stays for compatibility and always mirrors it.
create or replace function public.rooms_title_from_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.title := 'Room ' || new.global_id;
  return new;
end;
$$;

drop trigger if exists rooms_title_from_number on public.rooms;
create trigger rooms_title_from_number
  before insert or update of global_id, title on public.rooms
  for each row execute function public.rooms_title_from_number();

update public.rooms set title = 'Room ' || global_id where title is distinct from 'Room ' || global_id;
