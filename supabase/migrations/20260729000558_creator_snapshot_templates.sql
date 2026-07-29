begin;

create table if not exists public.creator_snapshot_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null
    references public.profiles(id)
    on delete cascade,
  name text not null,
  brand_label text not null,
  theme text not null,
  is_default boolean not null default false,
  created_at timestamptz not null
    default timezone('utc', now()),
  updated_at timestamptz not null
    default timezone('utc', now()),
  constraint creator_snapshot_templates_owner_id_id_unique
    unique (owner_id, id),
  constraint creator_snapshot_templates_name_length
    check (
      char_length(name) between 1 and 60
      and name !~ '[[:cntrl:]]'
    ),
  constraint creator_snapshot_templates_brand_label_length
    check (
      char_length(brand_label) between 1 and 32
      and brand_label !~ '[[:cntrl:]]'
    ),
  constraint creator_snapshot_templates_theme_check
    check (
      theme in (
        'sunset',
        'midnight',
        'paper'
      )
    )
);

create index if not exists creator_snapshot_templates_owner_updated_index
on public.creator_snapshot_templates (
  owner_id,
  updated_at desc
);

create unique index if not exists creator_snapshot_templates_one_default_index
on public.creator_snapshot_templates (
  owner_id
)
where is_default = true;

create or replace function public.touch_creator_snapshot_template_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

revoke all
on function public.touch_creator_snapshot_template_updated_at()
from public, anon, authenticated, service_role;

drop trigger if exists creator_snapshot_templates_touch_updated_at
on public.creator_snapshot_templates;

create trigger creator_snapshot_templates_touch_updated_at
before update
on public.creator_snapshot_templates
for each row
execute function public.touch_creator_snapshot_template_updated_at();

alter table public.creator_snapshot_templates
enable row level security;

drop policy if exists "Owners can read creator Snapshot templates"
on public.creator_snapshot_templates;

create policy "Owners can read creator Snapshot templates"
on public.creator_snapshot_templates
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = owner_id
);

revoke all
on public.creator_snapshot_templates
from public, anon, authenticated;

grant select
on public.creator_snapshot_templates
to authenticated;

create or replace function public.save_creator_snapshot_template(
  template_id_value uuid,
  name_value text,
  brand_label_value text,
  theme_value text,
  is_default_value boolean
)
returns public.creator_snapshot_templates
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  normalized_name text;
  normalized_brand_label text;
  normalized_theme text;
  normalized_is_default boolean;
  saved_template public.creator_snapshot_templates%rowtype;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'You must be signed into Canal to save a Snapshot template.';
  end if;

  normalized_name := btrim(coalesce(name_value, ''));
  normalized_brand_label := btrim(coalesce(brand_label_value, ''));
  normalized_theme := lower(btrim(coalesce(theme_value, '')));
  normalized_is_default := coalesce(is_default_value, false);

  if char_length(normalized_name) not between 1 and 60
    or normalized_name ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '22023',
      message = 'Snapshot template names must be between 1 and 60 characters without control characters.';
  end if;

  if char_length(normalized_brand_label) not between 1 and 32
    or normalized_brand_label ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '22023',
      message = 'Snapshot brand labels must be between 1 and 32 characters without control characters.';
  end if;

  if normalized_theme not in (
    'sunset',
    'midnight',
    'paper'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Snapshot template theme is invalid.';
  end if;

  perform 1
  from public.profiles as profile
  where profile.id = current_user_id
  for update;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'The signed-in Canal profile is unavailable.';
  end if;

  if template_id_value is null
    and (
      select count(*)
      from public.creator_snapshot_templates as template
      where template.owner_id = current_user_id
    ) >= 20 then
    raise exception using
      errcode = '22023',
      message = 'A creator can save at most 20 Snapshot templates.';
  end if;

  if normalized_is_default then
    update public.creator_snapshot_templates
    set is_default = false
    where owner_id = current_user_id
      and is_default = true;
  end if;

  if template_id_value is null then
    insert into public.creator_snapshot_templates (
      owner_id,
      name,
      brand_label,
      theme,
      is_default
    )
    values (
      current_user_id,
      normalized_name,
      normalized_brand_label,
      normalized_theme,
      normalized_is_default
    )
    returning *
    into saved_template;
  else
    update public.creator_snapshot_templates
    set
      name = normalized_name,
      brand_label = normalized_brand_label,
      theme = normalized_theme,
      is_default = normalized_is_default
    where id = template_id_value
      and owner_id = current_user_id
    returning *
    into saved_template;

    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'This Snapshot template is unavailable.';
    end if;
  end if;

  return saved_template;
end;
$$;

revoke all
on function public.save_creator_snapshot_template(
  uuid,
  text,
  text,
  text,
  boolean
)
from public, anon, authenticated, service_role;

grant execute
on function public.save_creator_snapshot_template(
  uuid,
  text,
  text,
  text,
  boolean
)
to authenticated;

create or replace function public.delete_creator_snapshot_template(
  template_id_value uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  deleted_was_default boolean;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'You must be signed into Canal to delete a Snapshot template.';
  end if;

  perform 1
  from public.profiles as profile
  where profile.id = current_user_id
  for update;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'The signed-in Canal profile is unavailable.';
  end if;

  delete from public.creator_snapshot_templates
  where id = template_id_value
    and owner_id = current_user_id
  returning is_default
  into deleted_was_default;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'This Snapshot template is unavailable.';
  end if;

  if deleted_was_default then
    update public.creator_snapshot_templates
    set is_default = true
    where id = (
      select template.id
      from public.creator_snapshot_templates as template
      where template.owner_id = current_user_id
      order by template.updated_at desc, template.id
      limit 1
    );
  end if;

  return true;
end;
$$;

revoke all
on function public.delete_creator_snapshot_template(uuid)
from public, anon, authenticated, service_role;

grant execute
on function public.delete_creator_snapshot_template(uuid)
to authenticated;

/*
 * Snapshot cards retain the exact creator branding that was selected
 * when they were first published. The template row can later be edited
 * or deleted without rewriting that historical provenance.
 */
alter table public.snapshots
add column if not exists template_id uuid;

alter table public.snapshots
add column if not exists template_brand_label text;

alter table public.snapshots
add column if not exists template_theme text;

alter table public.snapshots
drop constraint if exists snapshots_template_provenance_complete;

alter table public.snapshots
add constraint snapshots_template_provenance_complete
check (
  (
    template_id is null
    and template_brand_label is null
    and template_theme is null
  )
  or
  (
    template_id is not null
    and template_brand_label is not null
    and char_length(template_brand_label) between 1 and 32
    and template_brand_label !~ '[[:cntrl:]]'
    and template_theme in (
      'sunset',
      'midnight',
      'paper'
    )
  )
);

create or replace function public.stamp_snapshot_template_provenance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_template public.creator_snapshot_templates%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.template_id is distinct from old.template_id then
      raise exception using
        errcode = '22023',
        message = 'Snapshot template provenance is immutable.';
    end if;

    new.template_id := old.template_id;
    new.template_brand_label := old.template_brand_label;
    new.template_theme := old.template_theme;

    return new;
  end if;

  if new.template_id is null then
    new.template_brand_label := null;
    new.template_theme := null;

    return new;
  end if;

  select template.*
  into selected_template
  from public.creator_snapshot_templates as template
  where template.id = new.template_id
    and template.owner_id = new.user_id;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'This Snapshot template does not belong to the Snapshot creator.';
  end if;

  new.template_id := selected_template.id;
  new.template_brand_label := selected_template.brand_label;
  new.template_theme := selected_template.theme;

  return new;
end;
$$;

revoke all
on function public.stamp_snapshot_template_provenance()
from public, anon, authenticated, service_role;

drop trigger if exists snapshots_stamp_template_provenance
on public.snapshots;

create trigger snapshots_stamp_template_provenance
before insert or update of
  template_id,
  template_brand_label,
  template_theme
on public.snapshots
for each row
execute function public.stamp_snapshot_template_provenance();

commit;
