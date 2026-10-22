-- Voice chat signaling runs over private Realtime channels named "voice:<room uuid>".
-- Only members of that room may read or write on such a channel.

create function public.room_id_from_voice_topic(p_topic text) returns uuid
language plpgsql immutable set search_path = public
as $$
begin
  if p_topic like 'voice:%' then
    return substr(p_topic, 7)::uuid;
  end if;
  return null;
exception when others then
  return null;
end $$;
revoke execute on function public.room_id_from_voice_topic(text) from public, anon;
grant execute on function public.room_id_from_voice_topic(text) to authenticated;

do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages not present: skipping voice channel policies';
    return;
  end if;

  execute $p$
    create policy voice_members_read on realtime.messages for select to authenticated
    using (
      realtime.messages.extension in ('broadcast', 'presence')
      and public.is_room_member(public.room_id_from_voice_topic(realtime.topic()))
    )
  $p$;
  execute $p$
    create policy voice_members_write on realtime.messages for insert to authenticated
    with check (
      realtime.messages.extension in ('broadcast', 'presence')
      and public.is_room_member(public.room_id_from_voice_topic(realtime.topic()))
    )
  $p$;
end $$;
