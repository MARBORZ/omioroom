-- Migration: Add chat message reactions and message deletion
-- Allows active room members to react to messages with emojis
-- and allows sender / owner / controllers to delete messages.

alter table public.chat_messages add column if not exists reactions jsonb not null default '{}'::jsonb;

-- Toggle emoji reaction on a chat message
create or replace function public.toggle_chat_reaction(
  p_room_id uuid,
  p_message_id uuid,
  p_emoji text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_uid();
  v_reactions jsonb;
  v_arr jsonb;
  v_new_arr jsonb;
  v_emoji text := trim(coalesce(p_emoji, ''));
begin
  perform public.assert_active_member(p_room_id, v_uid);
  perform public.check_rate(v_uid, 'chat_reaction', 40, interval '10 seconds');

  if char_length(v_emoji) > 8 or v_emoji = '' then
    raise exception 'INVALID_PAYLOAD';
  end if;

  select reactions into v_reactions
  from public.chat_messages
  where id = p_message_id and room_id = p_room_id
  for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  v_reactions := coalesce(v_reactions, '{}'::jsonb);
  v_arr := coalesce(v_reactions -> v_emoji, '[]'::jsonb);

  if jsonb_path_exists(v_arr, ('$[*] ? (@ == "' || v_uid::text || '")')::jsonpath) then
    -- Remove reaction
    select coalesce(jsonb_agg(elem), '[]'::jsonb) into v_new_arr
    from jsonb_array_elements_text(v_arr) elem
    where elem <> v_uid::text;

    if jsonb_array_length(v_new_arr) = 0 then
      v_reactions := v_reactions - v_emoji;
    else
      v_reactions := jsonb_set(v_reactions, array[v_emoji], v_new_arr);
    end if;
  else
    -- Add reaction
    v_new_arr := v_arr || to_jsonb(v_uid::text);
    v_reactions := jsonb_set(v_reactions, array[v_emoji], v_new_arr);
  end if;

  update public.chat_messages
  set reactions = v_reactions
  where id = p_message_id and room_id = p_room_id;

  return v_reactions;
end $$;

revoke execute on function public.toggle_chat_reaction(uuid, uuid, text) from public, anon;
grant execute on function public.toggle_chat_reaction(uuid, uuid, text) to authenticated;

-- Delete a chat message (allowed by sender, room owner, or controllers)
create or replace function public.delete_chat_message(
  p_room_id uuid,
  p_message_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.require_uid();
  v_msg public.chat_messages;
begin
  perform public.assert_active_member(p_room_id, v_uid);

  select * into v_msg
  from public.chat_messages
  where id = p_message_id and room_id = p_room_id;

  if not found then
    return false;
  end if;

  if v_msg.sender_id <> v_uid
     and v_uid <> (select owner_id from public.rooms where id = p_room_id)
     and not exists (
       select 1 from public.room_members
       where room_id = p_room_id and user_id = v_uid and (role = 'owner' or can_control = true)
     ) then
    raise exception 'FORBIDDEN';
  end if;

  delete from public.chat_messages
  where id = p_message_id and room_id = p_room_id;

  return true;
end $$;

revoke execute on function public.delete_chat_message(uuid, uuid) from public, anon;
grant execute on function public.delete_chat_message(uuid, uuid) to authenticated;
