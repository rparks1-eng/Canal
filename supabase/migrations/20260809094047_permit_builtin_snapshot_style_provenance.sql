begin;

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
    template_id is null
    and lower(btrim(template_brand_label)) = 'canal'
    and template_theme in ('sunset', 'midnight', 'paper')
  )
  or
  (
    template_id is not null
    and template_brand_label is not null
    and char_length(template_brand_label) between 1 and 32
    and template_brand_label !~ '[[:cntrl:]]'
    and template_theme in ('sunset', 'midnight', 'paper')
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
    if new.template_id is not distinct from old.template_id then
      new.template_id := old.template_id;
      new.template_brand_label := old.template_brand_label;
      new.template_theme := old.template_theme;
      return new;
    end if;

    if old.template_id is not null and new.template_id is null then
      new.template_brand_label := null;
      new.template_theme := null;
      return new;
    end if;

    raise exception using
      errcode = '22023',
      message = 'Snapshot template provenance is immutable.';
  end if;

  if new.template_id is null then
    if new.template_brand_label is null and new.template_theme is null then
      return new;
    end if;

    if lower(btrim(new.template_brand_label)) <> 'canal'
      or new.template_theme not in ('sunset', 'midnight', 'paper') then
      raise exception using
        errcode = '22023',
        message = 'Snapshot style provenance is invalid.';
    end if;

    new.template_brand_label := 'canal';
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

commit;
