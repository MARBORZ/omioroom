-- Chat attachments are images only (png, jpeg, gif, webp, avif), uploaded from the device to a
-- private Storage bucket and shown through short-lived signed URLs. URL attachments are gone.

alter table public.chat_messages drop column attachment_url;
alter table public.chat_messages add column attachment_path text;
alter table public.chat_messages drop constraint chat_messages_attachment_type_check;
alter table public.chat_messages add constraint chat_messages_attachment_type_check
  check (attachment_type is null or attachment_type = 'image');

drop function public.send_chat(uuid, text, text, text);

-- Parses "<room uuid>/<file>" without raising on malformed input.
create function public.room_id_from_path(p_path text) returns uuid
language plpgsql immutable set search_path = public
as $$
begin
  return split_part(p_path, '/', 1)::uuid;
exception when others then
  return null;
end $$;

create function public.send_chat(
  p_room_id uuid,
  p_text text default '',
  p_attachment_path text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := public.require_uid();
  v_text text := trim(coalesce(p_text, ''));
  v_path text := nullif(trim(coalesce(p_attachment_path, '')), '');
  v_name text;
  v_msg public.chat_messages;
begin
  perform public.assert_active_member(p_room_id, v_uid);
  perform public.check_rate(v_uid, 'chat', 15, interval '10 seconds');

  if char_length(v_text) > 1000 then
    raise exception 'INVALID_PAYLOAD';
  end if;
  if v_text = '' and v_path is null then
    raise exception 'INVALID_PAYLOAD';
  end if;

  if v_path is not null then
    -- Must be a file this user just uploaded into this room's folder, and an image
    if v_path !~* ('^' || p_room_id::text || '/[0-9a-f-]{36}\.(png|jpe?g|gif|webp|avif)$') then
      raise exception 'INVALID_PAYLOAD';
    end if;
    if to_regclass('storage.objects') is not null then
      if not exists (
        select 1 from storage.objects o
        where o.bucket_id = 'chat-attachments' and o.name = v_path and o.owner = v_uid
      ) then
        raise exception 'INVALID_PAYLOAD';
      end if;
    end if;
  end if;

  select display_name into v_name from public.profiles where id = v_uid;

  insert into public.chat_messages (room_id, sender_id, sender_name, body, attachment_path, attachment_type)
    values (p_room_id, v_uid, v_name, v_text, v_path, case when v_path is null then null else 'image' end)
    returning * into v_msg;

  delete from public.chat_messages
    where room_id = p_room_id
      and id in (
        select id from public.chat_messages
        where room_id = p_room_id
        order by created_at desc, id desc
        offset 100
      );

  return jsonb_build_object(
    'id', v_msg.id, 'roomId', v_msg.room_id, 'senderId', v_msg.sender_id,
    'senderName', v_msg.sender_name, 'text', v_msg.body,
    'attachmentPath', v_msg.attachment_path, 'attachmentType', v_msg.attachment_type,
    'createdAt', v_msg.created_at
  );
end $$;

revoke execute on function public.send_chat(uuid, text, text) from public, anon;
grant execute on function public.send_chat(uuid, text, text) to authenticated;
-- Storage policies run as the signed-in role, so it must be able to call this pure helper
revoke execute on function public.room_id_from_path(text) from public, anon;
grant execute on function public.room_id_from_path(text) to authenticated;

-- Upload throttle: a few images per minute per user.
create function public.upload_allowed(p_user uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select to_regclass('storage.objects') is null or (
    select count(*) from storage.objects o
    where o.bucket_id = 'chat-attachments' and o.owner = p_user and o.created_at > now() - interval '1 minute'
  ) < 8
$$;
revoke execute on function public.upload_allowed(uuid) from public, anon;
grant execute on function public.upload_allowed(uuid) to authenticated;

-- Storage bucket + access rules (only where the Storage schema exists).
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present: skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'chat-attachments', 'chat-attachments', false, 5242880,
    array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']
  )
  on conflict (id) do update
    set public = false, file_size_limit = 5242880,
        allowed_mime_types = array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'];

  -- Members of a room may upload into that room's folder
  execute $p$
    create policy chat_attachments_insert on storage.objects for insert to authenticated
    with check (
      bucket_id = 'chat-attachments'
      and public.is_room_member(public.room_id_from_path(name))
      and public.upload_allowed(auth.uid())
    )
  $p$;
  -- ...and read what their room contains (signed URLs are created by members)
  execute $p$
    create policy chat_attachments_select on storage.objects for select to authenticated
    using (bucket_id = 'chat-attachments' and public.is_room_member(public.room_id_from_path(name)))
  $p$;
  -- The uploader and the room owner may delete (cleanup when a room closes)
  execute $p$
    create policy chat_attachments_delete on storage.objects for delete to authenticated
    using (
      bucket_id = 'chat-attachments'
      and (
        owner = auth.uid()
        or exists (
          select 1 from public.rooms r
          where r.id = public.room_id_from_path(name) and r.owner_id = auth.uid()
        )
      )
    )
  $p$;
end $$;
