-- Rooms owned by an admin no longer trim the chat to the last 100 messages (the chat is still erased when the room closes).

create or replace function public.send_chat(
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

  -- Keep only the last 100 messages per room, except in rooms an admin owns: those keep everything until the room is closed.
  if not coalesce(public.is_admin((select owner_id from public.rooms where id = p_room_id)), false) then
    delete from public.chat_messages
      where room_id = p_room_id
        and id in (
          select id from public.chat_messages
          where room_id = p_room_id
          order by created_at desc, id desc
          offset 100
        );
  end if;

  return jsonb_build_object(
    'id', v_msg.id, 'roomId', v_msg.room_id, 'senderId', v_msg.sender_id,
    'senderName', v_msg.sender_name, 'text', v_msg.body,
    'attachmentPath', v_msg.attachment_path, 'attachmentType', v_msg.attachment_type,
    'createdAt', v_msg.created_at
  );
end $$;

revoke execute on function public.send_chat(uuid, text, text) from public, anon;
grant execute on function public.send_chat(uuid, text, text) to authenticated;
