begin;

grant execute
on function private.live_stage_tracks_are_safe(jsonb)
to authenticated, service_role;

commit;
