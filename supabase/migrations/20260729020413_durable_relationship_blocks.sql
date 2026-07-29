begin;

/*
 * This table is intentionally committed before hardening begins. If the
 * audit gate fails, operators retain a private place to record reviewed
 * UUID mappings before retrying the migration.
 */
create table if not exists
private.user_relationship_block_verifications (
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  legacy_target_username text not null,
  verified_target_user_id uuid not null
    references auth.users(id)
    on delete cascade,
  verified_at timestamptz not null
    default timezone('utc', now()),
  verification_note text not null,
  primary key (
    user_id,
    legacy_target_username
  ),
  constraint user_relationship_block_verifications_username
    check (
      legacy_target_username =
        lower(legacy_target_username)
      and legacy_target_username !~ '^@'
      and length(legacy_target_username)
        between 1 and 80
    ),
  constraint user_relationship_block_verifications_note
    check (
      length(trim(verification_note))
        between 1 and 500
    ),
  constraint user_relationship_block_verifications_not_self
    check (
      user_id <> verified_target_user_id
    )
);

alter table
private.user_relationship_block_verifications
enable row level security;

revoke all
on table private.user_relationship_block_verifications
from public, anon, authenticated, service_role;

commit;

begin;

lock table public.user_relationships
in access exclusive mode;

lock table private.user_relationship_block_verifications
in share mode;

lock table public.profiles
in share row exclusive mode;

/*
 * Current handles cannot prove historical identity. Require explicit
 * operator evidence for every block, including rows that a prior
 * migration may already have auto-bound to a UUID.
 */
do $$
begin
  if exists (
    select 1
    from public.user_relationships as relationship
    where relationship.relationship_type = 'blocked'
      and not exists (
        select 1
        from private.user_relationship_block_verifications
          as verification
        where verification.user_id =
            relationship.user_id
          and verification.legacy_target_username =
            relationship.target_username
      )
  ) then
    raise exception
      'Cannot harden Canal blocks without reviewed UUID evidence for every existing block.'
      using
        errcode = '23502',
        hint =
          'Insert an operator-reviewed row into private.user_relationship_block_verifications for every blocked relationship, including already non-null target IDs, then retry.';
  end if;

  if exists (
    select 1
    from public.user_relationships as relationship
    where relationship.relationship_type <> 'blocked'
      and relationship.target_user_id is null
  ) then
    raise exception
      'Cannot harden Canal relationships while a non-block relationship has no target UUID.'
      using
        errcode = '23502',
        hint =
          'Repair or remove the invalid non-block relationship explicitly, then retry this migration.';
  end if;
end;
$$;

/*
 * Remove the prior profile FK and partial UUID uniqueness only after the
 * provenance gate passes. Reviewed corrections can then merge with a
 * pre-existing row for the same immutable pair during deduplication.
 */
alter table public.user_relationships
drop constraint if exists
user_relationships_target_user_id_fkey;

drop index if exists
public.user_relationships_owner_target_unique_index;

update public.user_relationships as relationship
set target_user_id =
  verification.verified_target_user_id
from private.user_relationship_block_verifications
  as verification
where relationship.relationship_type = 'blocked'
  and verification.user_id =
    relationship.user_id
  and verification.legacy_target_username =
    relationship.target_username
  and relationship.target_user_id is distinct from
    verification.verified_target_user_id;

/*
 * Prefer the privacy-preserving block if historical data contains more
 * than one relationship for the same pair. Within the same relationship
 * type, retain the newest snapshot deterministically.
 */
with ranked_relationships as (
  select
    ctid,
    row_number() over (
      partition by
        user_id,
        target_user_id
      order by
        case relationship_type
          when 'blocked' then 0
          else 1
        end,
        created_at desc,
        target_username,
        ctid
    ) as relationship_rank
  from public.user_relationships
)
delete from public.user_relationships as relationship
using ranked_relationships as ranked
where relationship.ctid = ranked.ctid
  and ranked.relationship_rank > 1;

/*
 * Apply the same privacy-winning rule across directions: if either
 * account has blocked the other, no reciprocal follow may survive.
 */
delete from public.user_relationships as follow
using public.user_relationships as block
where follow.relationship_type = 'following'
  and block.relationship_type = 'blocked'
  and follow.user_id = block.target_user_id
  and follow.target_user_id = block.user_id;

alter table public.user_relationships
drop constraint if exists user_relationships_pkey;

alter table public.user_relationships
add constraint user_relationships_target_user_id_fkey
foreign key (target_user_id)
references auth.users(id)
on delete cascade;

alter table public.user_relationships
alter column target_user_id set not null;

alter table public.user_relationships
drop constraint if exists user_relationships_not_self;

alter table public.user_relationships
add constraint user_relationships_not_self
check (target_user_id <> user_id);

alter table public.user_relationships
drop constraint if exists user_relationships_follow_target_required;

alter table public.user_relationships
add constraint user_relationships_pkey
primary key (
  user_id,
  target_user_id
);

/*
 * UUID-backed rows can refresh their display snapshot unambiguously.
 * This never attempts to infer an ID from a historical username.
 */
update public.user_relationships as relationship
set target_username = lower(target_profile.handle)
from public.profiles as target_profile
where relationship.target_user_id = target_profile.id
  and relationship.target_username is distinct from
    lower(target_profile.handle);

/*
 * Every privacy consumer now resolves a block solely by immutable UUID.
 * target_username remains a presentation/cache snapshot and never makes
 * an authorization decision.
 */
create or replace function private.canal_users_are_blocked(
  first_user_id uuid,
  second_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and (
      (select auth.uid()) = first_user_id
      or (select auth.uid()) = second_user_id
    )
    and exists (
      select 1
      from public.user_relationships as relationship
      where relationship.user_id = first_user_id
        and relationship.target_user_id = second_user_id
        and relationship.relationship_type = 'blocked'
    );
$$;

revoke all
on function private.canal_users_are_blocked(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute
on function private.canal_users_are_blocked(uuid, uuid)
to authenticated;

/*
 * A profile rename updates only the cached username snapshot. The
 * relationship identity and all authorization checks remain UUID-based.
 */
create or replace function private.refresh_relationship_target_username()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.user_relationships
    set target_username = lower(new.handle)
    where target_user_id = new.id
      and target_username is distinct from lower(new.handle);
  elsif old.handle is distinct from new.handle then
    update public.user_relationships
    set target_username = lower(new.handle)
    where target_user_id = new.id
      and target_username is distinct from lower(new.handle);
  end if;

  return new;
end;
$$;

revoke all
on function private.refresh_relationship_target_username()
from public, anon, authenticated, service_role;

drop trigger if exists profiles_refresh_relationship_target_username
on public.profiles;

create trigger profiles_refresh_relationship_target_username
after insert or update of handle
on public.profiles
for each row
execute function private.refresh_relationship_target_username();

/*
 * Direct follows and block RPCs take the same transaction-scoped pair
 * lock. This makes the reciprocal-block check durable even when a
 * follow and block arrive concurrently.
 */
create or replace function private.enforce_relationship_pair_invariants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id is not distinct from old.user_id
      and new.target_user_id is not distinct from old.target_user_id
      and new.relationship_type is not distinct from old.relationship_type
      then
      return new;
    end if;
  end if;

  /*
   * Do not let an authenticated caller probe another pair through a
   * BEFORE-trigger error. RLS will reject the foreign-owner write.
   * Trusted database work with no request UID still gets the invariant.
   */
  if (select auth.uid()) is not null
    and (select auth.uid()) <> new.user_id then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      least(
        new.user_id::text,
        new.target_user_id::text
      )
      || ':'
      || greatest(
        new.user_id::text,
        new.target_user_id::text
      ),
      0
    )
  );

  if new.relationship_type = 'following'
    and (
      exists (
        select 1
        from public.user_relationships as block
        where block.user_id = new.user_id
          and block.target_user_id =
            new.target_user_id
          and block.relationship_type = 'blocked'
      )
      or exists (
        select 1
        from public.user_relationships as block
        where block.user_id =
            new.target_user_id
          and block.target_user_id =
            new.user_id
          and block.relationship_type = 'blocked'
      )
    ) then
    raise exception
      'A follow cannot cross an active Canal block.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all
on function private.enforce_relationship_pair_invariants()
from public, anon, authenticated, service_role;

drop trigger if exists user_relationships_enforce_pair_invariants
on public.user_relationships;

create trigger user_relationships_enforce_pair_invariants
before insert or update
on public.user_relationships
for each row
execute function private.enforce_relationship_pair_invariants();

/*
 * UUIDs are authoritative and their current handle is canonicalized
 * server-side. target_username_value remains only for client signature
 * compatibility; it never resolves, moves, or deletes a relationship.
 */
create or replace function public.set_canal_user_block(
  target_user_id_value uuid,
  target_username_value text,
  blocked_value boolean,
  expected_actor_id_value uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
  current_target_username text;
  resolved_target_user_id uuid;
begin
  if current_user_id is null then
    raise exception
      'Authentication is required to change a Canal block.'
      using errcode = '42501';
  end if;

  if expected_actor_id_value is null
    or expected_actor_id_value <> current_user_id then
    raise exception
      'The signed-in Canal account changed before the block was saved.'
      using errcode = '42501';
  end if;

  if blocked_value is null then
    raise exception
      'A block state is required.'
      using errcode = '22023';
  end if;

  if target_user_id_value is null then
    raise exception
      'An immutable target profile ID is required to change a block.'
      using errcode = '22023';
  end if;

  if target_user_id_value = current_user_id then
    raise exception
      'A Canal account cannot block or unblock itself.'
      using errcode = '22023';
  end if;

  if not blocked_value then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        least(
          current_user_id::text,
          target_user_id_value::text
        )
        || ':'
        || greatest(
          current_user_id::text,
          target_user_id_value::text
        ),
        0
      )
    );

    delete from public.user_relationships
    where user_id = current_user_id
      and target_user_id =
        target_user_id_value
      and relationship_type = 'blocked';

    return;
  end if;

  /*
   * The UUID is authoritative. Ignore a stale supplied handle and
   * store the profile's current canonical handle.
   */
  select
    target_profile.id,
    lower(target_profile.handle)
  into
    resolved_target_user_id,
    current_target_username
  from public.profiles as target_profile
  where target_profile.id =
    target_user_id_value
  for share;

  if resolved_target_user_id is null
    or current_target_username is null then
    raise exception
      'The target Canal profile could not be resolved.'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      least(
        current_user_id::text,
        resolved_target_user_id::text
      )
      || ':'
      || greatest(
        current_user_id::text,
        resolved_target_user_id::text
      ),
      0
    )
  );

  delete from public.user_relationships
  where relationship_type = 'following'
    and (
      (
        user_id = current_user_id
        and target_user_id =
          resolved_target_user_id
      )
      or (
        user_id = resolved_target_user_id
        and target_user_id =
          current_user_id
      )
    );

  insert into public.user_relationships (
    user_id,
    target_user_id,
    target_username,
    relationship_type,
    created_at
  )
  values (
    current_user_id,
    resolved_target_user_id,
    current_target_username,
    'blocked',
    timezone('utc', now())
  )
  on conflict (
    user_id,
    target_user_id
  )
  do update
  set
    target_username =
      excluded.target_username,
    relationship_type = 'blocked',
    created_at = excluded.created_at;
end;
$$;

revoke all
on function public.set_canal_user_block(uuid, text, boolean, uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.set_canal_user_block(uuid, text, boolean, uuid)
to authenticated;

/*
 * Browser clients may write follows directly, but cannot manufacture or
 * rewrite block rows. Both directions are checked so a follow cannot be
 * created while either account has blocked the other.
 */
drop policy if exists "Users can read profile follows"
on public.user_relationships;

create policy "Users can read profile follows"
on public.user_relationships
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or (
    relationship_type = 'following'
    and (
      target_user_id = (select auth.uid())
      or (
        exists (
          select 1
          from public.profiles as source_profile
          where source_profile.id = user_id
            and source_profile.is_public = true
        )
        and exists (
          select 1
          from public.profiles as target_profile
          where target_profile.id = target_user_id
            and target_profile.is_public = true
        )
      )
    )
    and not private.canal_users_are_blocked(
      (select auth.uid()),
      user_id
    )
    and not private.canal_users_are_blocked(
      user_id,
      (select auth.uid())
    )
    and not private.canal_users_are_blocked(
      (select auth.uid()),
      target_user_id
    )
    and not private.canal_users_are_blocked(
      target_user_id,
      (select auth.uid())
    )
  )
);

drop policy if exists "Users can create their own relationships"
on public.user_relationships;

create policy "Users can create their own relationships"
on public.user_relationships
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and relationship_type = 'following'
  and target_user_id is not null
  and target_user_id <> (select auth.uid())
  and exists (
    select 1
    from public.profiles as target_profile
    where target_profile.id = target_user_id
      and target_profile.is_public = true
      and lower(target_profile.handle) =
        lower(target_username)
  )
  and not private.canal_users_are_blocked(
    (select auth.uid()),
    target_user_id
  )
  and not private.canal_users_are_blocked(
    target_user_id,
    (select auth.uid())
  )
);

drop policy if exists "Users can update their own relationships"
on public.user_relationships;

create policy "Users can update their own relationships"
on public.user_relationships
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and relationship_type = 'following'
)
with check (
  (select auth.uid()) = user_id
  and relationship_type = 'following'
  and target_user_id is not null
  and target_user_id <> (select auth.uid())
  and exists (
    select 1
    from public.profiles as target_profile
    where target_profile.id = target_user_id
      and target_profile.is_public = true
      and lower(target_profile.handle) =
        lower(target_username)
  )
  and not private.canal_users_are_blocked(
    (select auth.uid()),
    target_user_id
  )
  and not private.canal_users_are_blocked(
    target_user_id,
    (select auth.uid())
  )
);

drop policy if exists "Users can delete their own relationships"
on public.user_relationships;

create policy "Users can delete their own relationships"
on public.user_relationships
for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and relationship_type = 'following'
);

commit;
