begin;

revoke all on table public.soundscape_archives from public, anon;
revoke all on table public.soundscape_refresh_state from public, anon;
revoke all on table public.soundscape_common_ground_consents from public, anon;

grant select, insert, update, delete
  on table public.soundscape_archives
  to authenticated;
grant select, insert, update, delete
  on table public.soundscape_refresh_state
  to authenticated;
grant select
  on table public.soundscape_common_ground_consents
  to authenticated;

commit;
