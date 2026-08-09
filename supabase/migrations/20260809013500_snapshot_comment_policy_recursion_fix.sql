begin;

drop policy if exists "Users can comment on accessible Snapshots"
on public.snapshot_comments;

create policy "Users can comment on accessible Snapshots"
on public.snapshot_comments
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.snapshots as snapshot
    where snapshot.id = snapshot_id
      and (
        snapshot.user_id = (select auth.uid())
        or (
          snapshot.visibility = 'public'
          and not private.canal_users_are_blocked(snapshot.user_id, (select auth.uid()))
          and not private.canal_users_are_blocked((select auth.uid()), snapshot.user_id)
        )
      )
  )
);

commit;
