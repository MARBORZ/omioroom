-- The text checked against the blocked terms includes the author and description; what is stored (and shown in the
-- feed) is just the title.
drop function if exists public.record_media_verdict(uuid, text, text, text, text);
create or replace function public.record_media_verdict(
  p_room_id uuid, p_media_key text, p_title text, p_verdict text, p_reason text, p_display_title text default null
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
    values (p_media_key, left(coalesce(nullif(trim(p_display_title), ''), p_title), 300), p_verdict, p_reason)
    on conflict (media_key) do update
      set title = excluded.title, verdict = excluded.verdict, reason = excluded.reason, checked_at = now();
  if p_verdict = 'blocked' then
    return public.reject_media(p_room_id, p_media_key, p_reason);
  end if;
  return false;
end $$;
revoke execute on function public.record_media_verdict(uuid, text, text, text, text, text) from public, anon, authenticated;
