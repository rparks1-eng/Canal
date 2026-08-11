begin;

create table if not exists public.user_app_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_app_settings_object check (jsonb_typeof(settings) = 'object'),
  constraint user_app_settings_bounded check (octet_length(settings::text) <= 8192)
);

alter table public.user_app_settings enable row level security;
drop policy if exists "Users manage their own app settings" on public.user_app_settings;
create policy "Users manage their own app settings"
on public.user_app_settings for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table public.user_app_settings from public, anon;
grant select, insert, update, delete on table public.user_app_settings to authenticated;

commit;
