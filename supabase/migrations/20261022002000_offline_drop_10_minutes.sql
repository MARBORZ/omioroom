-- Members who stay offline are dropped from the list after 10 minutes (was 5).
create or replace function public.drop_offline_members(p_max_idle interval default interval '10 minutes') returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_count integer := 0;
  v_row record;
begin
  for v_row in
    select m.room_id, m.user_id
    from public.room_members m
    join public.rooms r on r.id = m.room_id and r.status = 'active'
    left join public.member_activity a on a.room_id = m.room_id and a.user_id = m.user_id
    where m.role <> 'owner'
      and coalesce(a.last_active_at, m.joined_at) < now() - p_max_idle
  loop
    perform public.remove_member(v_row.room_id, v_row.user_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function public.drop_offline_members(interval) from public, anon, authenticated;

do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule('omioroom-drop-offline-members');
    perform cron.schedule(
      'omioroom-drop-offline-members',
      '* * * * *',
      $job$ select public.drop_offline_members(interval '10 minutes') $job$
    );
  end if;
exception when others then
  raise notice 'could not reschedule cron job: %', sqlerrm;
end $$;
