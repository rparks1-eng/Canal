begin;

create table if not exists public.creator_event_run_sheets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null
    references public.profiles(id)
    on delete cascade,
  collection_id uuid not null,
  title text not null,
  venue_label text not null,
  starts_at timestamptz not null,
  time_zone text not null,
  active_position integer not null default 0,
  status text not null default 'planned',
  created_at timestamptz not null
    default timezone('utc', now()),
  updated_at timestamptz not null
    default timezone('utc', now()),
  constraint creator_event_run_sheets_owner_id_id_unique
    unique (owner_id, id),
  constraint creator_event_run_sheets_collection_fkey
    foreign key (
      owner_id,
      collection_id
    )
    references public.creator_scene_collections (
      owner_id,
      id
    )
    on delete cascade,
  constraint creator_event_run_sheets_title_length
    check (
      char_length(title) between 1 and 80
      and title !~ '[[:cntrl:]]'
    ),
  constraint creator_event_run_sheets_venue_length
    check (
      char_length(venue_label) between 1 and 120
      and venue_label !~ '[[:cntrl:]]'
    ),
  constraint creator_event_run_sheets_time_zone_length
    check (
      char_length(time_zone) between 1 and 64
      and time_zone !~ '[[:cntrl:]]'
    ),
  constraint creator_event_run_sheets_position_nonnegative
    check (active_position >= 0),
  constraint creator_event_run_sheets_status_check
    check (
      status in (
        'planned',
        'completed'
      )
    )
);

create index if not exists creator_event_run_sheets_owner_starts_index
on public.creator_event_run_sheets (
  owner_id,
  starts_at,
  id
);

create index if not exists creator_event_run_sheets_collection_index
on public.creator_event_run_sheets (
  owner_id,
  collection_id
);

create or replace function public.validate_creator_event_run_sheet()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  collection_item_count integer;
begin
  select count(*)::integer
  into collection_item_count
  from public.creator_scene_collection_items as item
  where item.owner_id = new.owner_id
    and item.collection_id = new.collection_id;

  if collection_item_count = 0 then
    raise exception using
      errcode = '22023',
      message = 'An Event Run Sheet requires a Scene collection with at least one item.';
  end if;

  if new.active_position > collection_item_count
    or (
      new.status = 'planned'
      and new.active_position >= collection_item_count
    ) then
    raise exception using
      errcode = '22023',
      message = 'The Event Run Sheet position is outside its Scene collection.';
  end if;

  new.updated_at :=
    timezone('utc', now());

  return new;
end;
$$;

revoke all
on function public.validate_creator_event_run_sheet()
from public, anon, authenticated, service_role;

drop trigger if exists creator_event_run_sheets_validate
on public.creator_event_run_sheets;

create trigger creator_event_run_sheets_validate
before insert or update
on public.creator_event_run_sheets
for each row
execute function public.validate_creator_event_run_sheet();

create or replace function public.validate_creator_event_run_sheets_after_collection_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_owner_id uuid;
  target_collection_id uuid;
  collection_item_count integer;
begin
  if tg_op in ('DELETE', 'UPDATE') then
    target_owner_id :=
      old.owner_id;
    target_collection_id :=
      old.collection_id;

    select count(*)::integer
    into collection_item_count
    from public.creator_scene_collection_items as item
    where item.owner_id = target_owner_id
      and item.collection_id = target_collection_id;

    if exists (
      select 1
      from public.creator_event_run_sheets as run_sheet
      where run_sheet.owner_id = target_owner_id
        and run_sheet.collection_id = target_collection_id
        and (
          collection_item_count = 0
          or run_sheet.active_position > collection_item_count
          or (
            run_sheet.status = 'planned'
            and run_sheet.active_position >= collection_item_count
          )
        )
    ) then
      raise exception using
        errcode = '22023',
        message = 'This Scene collection change would invalidate an Event Run Sheet position.';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    target_owner_id :=
      new.owner_id;
    target_collection_id :=
      new.collection_id;

    select count(*)::integer
    into collection_item_count
    from public.creator_scene_collection_items as item
    where item.owner_id = target_owner_id
      and item.collection_id = target_collection_id;

    if exists (
      select 1
      from public.creator_event_run_sheets as run_sheet
      where run_sheet.owner_id = target_owner_id
        and run_sheet.collection_id = target_collection_id
        and (
          collection_item_count = 0
          or run_sheet.active_position > collection_item_count
          or (
            run_sheet.status = 'planned'
            and run_sheet.active_position >= collection_item_count
          )
        )
    ) then
      raise exception using
        errcode = '22023',
        message = 'This Scene collection change would invalidate an Event Run Sheet position.';
    end if;
  end if;

  return null;
end;
$$;

revoke all
on function public.validate_creator_event_run_sheets_after_collection_change()
from public, anon, authenticated, service_role;

drop trigger if exists creator_event_run_sheets_validate_collection_change
on public.creator_scene_collection_items;

create constraint trigger creator_event_run_sheets_validate_collection_change
after insert or update or delete
on public.creator_scene_collection_items
deferrable initially deferred
for each row
execute function public.validate_creator_event_run_sheets_after_collection_change();

alter table public.creator_event_run_sheets
enable row level security;

drop policy if exists "Owners can read Event Run Sheets"
on public.creator_event_run_sheets;

create policy "Owners can read Event Run Sheets"
on public.creator_event_run_sheets
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = owner_id
);

revoke all
on public.creator_event_run_sheets
from public, anon, authenticated;

grant select
on public.creator_event_run_sheets
to authenticated;

create or replace function public.save_creator_event_run_sheet(
  run_sheet_id_value uuid,
  collection_id_value uuid,
  title_value text,
  venue_label_value text,
  starts_at_value timestamptz,
  time_zone_value text
)
returns public.creator_event_run_sheets
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
  normalized_title text :=
    btrim(
      coalesce(
        title_value,
        ''
      )
    );
  normalized_venue_label text :=
    btrim(
      coalesce(
        venue_label_value,
        ''
      )
    );
  normalized_time_zone text :=
    btrim(
      coalesce(
        time_zone_value,
        ''
      )
    );
  target_run_sheet_id uuid :=
    coalesce(
      run_sheet_id_value,
      gen_random_uuid()
    );
  existing_owner_id uuid;
  collection_item_count integer;
  saved_run_sheet public.creator_event_run_sheets%rowtype;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required to save an Event Run Sheet.';
  end if;

  if collection_id_value is null then
    raise exception using
      errcode = '22023',
      message = 'A Scene collection is required.';
  end if;

  if char_length(normalized_title) not between 1 and 80
    or normalized_title ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '22023',
      message = 'Run Sheet titles must be between 1 and 80 characters without control characters.';
  end if;

  if char_length(normalized_venue_label) not between 1 and 120
    or normalized_venue_label ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '22023',
      message = 'Venue labels must be between 1 and 120 characters without control characters.';
  end if;

  if char_length(normalized_time_zone) not between 1 and 64
    or normalized_time_zone ~ '[[:cntrl:]]'
    or not exists (
      select 1
      from pg_catalog.pg_timezone_names as zone
      where zone.name = normalized_time_zone
    ) then
    raise exception using
      errcode = '22023',
      message = 'Choose a valid IANA time zone.';
  end if;

  if starts_at_value is null
    or not isfinite(starts_at_value) then
    raise exception using
      errcode = '22023',
      message = 'A finite Event Run Sheet start time is required.';
  end if;

  select collection.owner_id
  into existing_owner_id
  from public.creator_scene_collections as collection
  where collection.id = collection_id_value
  for share;

  if not found
    or existing_owner_id <> current_user_id then
    raise exception using
      errcode = '42501',
      message = 'Event Run Sheets can use only the owner''s Scene collections.';
  end if;

  select count(*)::integer
  into collection_item_count
  from public.creator_scene_collection_items as item
  where item.owner_id = current_user_id
    and item.collection_id = collection_id_value;

  if collection_item_count = 0 then
    raise exception using
      errcode = '22023',
      message = 'An Event Run Sheet requires a Scene collection with at least one item.';
  end if;

  select run_sheet.owner_id
  into existing_owner_id
  from public.creator_event_run_sheets as run_sheet
  where run_sheet.id = target_run_sheet_id
  for update;

  if found
    and existing_owner_id <> current_user_id then
    raise exception using
      errcode = '42501',
      message = 'An Event Run Sheet owner is immutable.';
  end if;

  if existing_owner_id is null then
    insert into public.creator_event_run_sheets (
      id,
      owner_id,
      collection_id,
      title,
      venue_label,
      starts_at,
      time_zone,
      active_position,
      status
    )
    values (
      target_run_sheet_id,
      current_user_id,
      collection_id_value,
      normalized_title,
      normalized_venue_label,
      starts_at_value,
      normalized_time_zone,
      0,
      'planned'
    )
    returning *
    into saved_run_sheet;
  else
    update public.creator_event_run_sheets
    set
      collection_id = collection_id_value,
      title = normalized_title,
      venue_label = normalized_venue_label,
      starts_at = starts_at_value,
      time_zone = normalized_time_zone
    where id = target_run_sheet_id
      and owner_id = current_user_id
    returning *
    into saved_run_sheet;
  end if;

  return saved_run_sheet;
end;
$$;

revoke all
on function public.save_creator_event_run_sheet(
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  text
)
from public, anon, authenticated, service_role;

grant execute
on function public.save_creator_event_run_sheet(
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  text
)
to authenticated;

create or replace function public.advance_creator_event_run_sheet(
  run_sheet_id_value uuid,
  expected_position_value integer
)
returns public.creator_event_run_sheets
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
  collection_item_count integer;
  current_run_sheet public.creator_event_run_sheets%rowtype;
  saved_run_sheet public.creator_event_run_sheets%rowtype;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required to advance an Event Run Sheet.';
  end if;

  if run_sheet_id_value is null
    or expected_position_value is null
    or expected_position_value < 0 then
    raise exception using
      errcode = '22023',
      message = 'A valid Run Sheet ID and expected position are required.';
  end if;

  select run_sheet.*
  into current_run_sheet
  from public.creator_event_run_sheets as run_sheet
  where run_sheet.id = run_sheet_id_value
    and run_sheet.owner_id = current_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'This Event Run Sheet is unavailable.';
  end if;

  if current_run_sheet.status = 'completed' then
    raise exception using
      errcode = '22023',
      message = 'This Event Run Sheet is already completed.';
  end if;

  if current_run_sheet.active_position
    <> expected_position_value then
    raise exception using
      errcode = '40001',
      message = 'The Event Run Sheet advanced on another device. Reload before trying again.';
  end if;

  select count(*)::integer
  into collection_item_count
  from public.creator_scene_collection_items as item
  where item.owner_id = current_user_id
    and item.collection_id = current_run_sheet.collection_id;

  if collection_item_count = 0
    or current_run_sheet.active_position >= collection_item_count then
    raise exception using
      errcode = '22023',
      message = 'The Event Run Sheet position is outside its Scene collection.';
  end if;

  update public.creator_event_run_sheets
  set
    active_position =
      current_run_sheet.active_position + 1,
    status =
      case
        when current_run_sheet.active_position + 1
          >= collection_item_count
        then 'completed'
        else 'planned'
      end
  where id = current_run_sheet.id
    and owner_id = current_user_id
    and active_position = expected_position_value
  returning *
  into saved_run_sheet;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'The Event Run Sheet advanced on another device. Reload before trying again.';
  end if;

  return saved_run_sheet;
end;
$$;

revoke all
on function public.advance_creator_event_run_sheet(uuid, integer)
from public, anon, authenticated, service_role;

grant execute
on function public.advance_creator_event_run_sheet(uuid, integer)
to authenticated;

create or replace function public.delete_creator_event_run_sheet(
  run_sheet_id_value uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid :=
    (select auth.uid());
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required to delete an Event Run Sheet.';
  end if;

  delete from public.creator_event_run_sheets
  where id = run_sheet_id_value
    and owner_id = current_user_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'This Event Run Sheet is unavailable.';
  end if;

  return true;
end;
$$;

revoke all
on function public.delete_creator_event_run_sheet(uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.delete_creator_event_run_sheet(uuid)
to authenticated;

commit;
