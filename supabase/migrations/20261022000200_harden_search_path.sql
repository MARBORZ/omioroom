-- Pin search_path on the helper functions that did not set one (Supabase linter 0011).
alter function public.require_uid() set search_path = public;
alter function public.server_time_ms() set search_path = public;
alter function public.seat_active_cutoff() set search_path = public;
alter function public.generate_private_code() set search_path = public;
alter function public.hash_secret(text) set search_path = public;
alter function public.random_display_name() set search_path = public;
alter function public.playback_dto(public.playback_state) set search_path = public;
alter function public.expected_position(public.playback_state, bigint) set search_path = public;
