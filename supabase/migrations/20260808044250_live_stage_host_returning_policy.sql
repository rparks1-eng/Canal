/*
 * Let a host read the row created by INSERT ... RETURNING immediately.
 *
 * The broader access helper remains responsible for public/member/block/ban
 * visibility. Its stable lookup cannot reliably observe the new row during
 * the INSERT statement snapshot, so the host predicate must be direct.
 */
drop policy if exists "Members can read accessible live Stages"
on public.live_stages;

create policy "Members can read accessible live Stages"
on public.live_stages
for select
to authenticated
using (
  (
    (select auth.uid()) is not null
    and (select auth.uid()) = host_id
  )
  or (select private.can_access_live_stage(id))
);
