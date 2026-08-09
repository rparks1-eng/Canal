begin;

alter table public.live_stage_messages
add column if not exists edited_at timestamptz;

create table if not exists public.live_stage_message_reactions (
  message_id uuid not null references public.live_stage_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('heart', 'applause', 'spark')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, reaction)
);

create index if not exists live_stage_message_reactions_message_index
on public.live_stage_message_reactions (message_id, created_at);

alter table public.live_stage_message_reactions enable row level security;

drop policy if exists "Members can read Stage message reactions"
on public.live_stage_message_reactions;
create policy "Members can read Stage message reactions"
on public.live_stage_message_reactions for select to authenticated
using (
  exists (
    select 1 from public.live_stage_messages as message
    where message.id = message_id
      and (select private.can_access_live_stage(message.stage_id))
  )
);

drop policy if exists "Members can add their Stage message reactions"
on public.live_stage_message_reactions;
create policy "Members can add their Stage message reactions"
on public.live_stage_message_reactions for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.live_stage_messages as message
    join public.live_stages as stage on stage.id = message.stage_id
    join public.live_stage_members as member on member.stage_id = stage.id
    where message.id = message_id
      and member.user_id = (select auth.uid())
      and stage.status = 'live'
  )
);

drop policy if exists "Members can remove their Stage message reactions"
on public.live_stage_message_reactions;
create policy "Members can remove their Stage message reactions"
on public.live_stage_message_reactions for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Authors can edit their live Stage messages"
on public.live_stage_messages;
create policy "Authors can edit their live Stage messages"
on public.live_stage_messages for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.live_stages as stage
    where stage.id = stage_id and stage.status = 'live'
  )
);

create or replace function private.stamp_live_stage_message_edit()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists live_stage_messages_stamp_edit on public.live_stage_messages;
create trigger live_stage_messages_stamp_edit
before update of body on public.live_stage_messages
for each row execute function private.stamp_live_stage_message_edit();

grant select, insert, delete on public.live_stage_message_reactions to authenticated;

commit;
