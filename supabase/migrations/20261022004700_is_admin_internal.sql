-- is_admin(uuid) lets a caller ask whether ANY user is an admin. Only triggers (which run as the owner) use it now
-- that the Storage policies are gone, so signed-in clients no longer get to call it.
revoke execute on function public.is_admin(uuid) from authenticated;
