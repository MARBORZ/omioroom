-- An 'unknown' answer (the platform could not be read) must be asked again, not remembered.
create or replace function public.request_media_check() returns trigger
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
  select * into v_cached from public.media_verdicts where media_key = v_key and verdict in ('ok', 'blocked') and checked_at > now() - interval '7 days';
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
