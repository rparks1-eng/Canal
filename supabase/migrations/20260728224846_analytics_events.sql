begin;

create extension if not exists pg_cron
with schema pg_catalog;

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  client_event_id uuid not null unique,
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  event_name text not null,
  failure_point text,
  failure_class text,
  attempt text not null default 'initial',
  platform text not null,
  schema_version smallint not null default 1,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days'),

  constraint analytics_events_event_name_check
    check (
      event_name in (
        'onboarding_completed',
        'first_scene_created',
        'scene_export_completed',
        'snapshot_published',
        'seven_day_return',
        'workflow_failed'
      )
    ),

  constraint analytics_events_failure_point_check
    check (
      failure_point is null or
      failure_point in (
        'sign_up',
        'sign_in',
        'social_sign_in',
        'auth_callback',
        'password_reset_request',
        'password_reset_verify',
        'password_reset_update',
        'session_restore',
        'onboarding_complete',
        'scene_create',
        'scene_export',
        'snapshot_publish'
      )
    ),

  constraint analytics_events_failure_class_check
    check (
      failure_class is null or
      failure_class in (
        'offline',
        'authentication',
        'permission',
        'rate_limited',
        'validation',
        'configuration',
        'service',
        'storage',
        'unknown'
      )
    ),

  constraint analytics_events_attempt_check
    check (
      attempt in (
        'initial',
        'retry'
      )
    ),

  constraint analytics_events_platform_check
    check (
      platform in (
        'ios',
        'android',
        'web'
      )
    ),

  constraint analytics_events_schema_version_check
    check (schema_version = 1),

  constraint analytics_events_shape_check
    check (
      (
        event_name = 'workflow_failed' and
        failure_point is not null and
        failure_class is not null
      ) or (
        event_name <> 'workflow_failed' and
        failure_point is null and
        failure_class is null
      )
    ),

  constraint analytics_events_client_time_check
    check (
      occurred_at >= created_at - interval '7 days' and
      occurred_at <= created_at + interval '5 minutes'
    ),

  constraint analytics_events_retention_check
    check (
      expires_at > created_at and
      expires_at <= created_at + interval '90 days'
    )
);

create index if not exists analytics_events_user_created_index
on public.analytics_events (
  user_id,
  created_at desc,
  id desc
);

create index if not exists analytics_events_retention_index
on public.analytics_events (
  expires_at
);

create unique index if not exists analytics_events_once_per_user_index
on public.analytics_events (
  user_id,
  event_name
)
where event_name in (
  'onboarding_completed',
  'first_scene_created',
  'seven_day_return'
);

alter table public.analytics_events
enable row level security;

drop policy if exists "Users can read their own analytics events"
on public.analytics_events;

create policy "Users can read their own analytics events"
on public.analytics_events
for select
to authenticated
using (
  (select auth.uid()) = user_id
);

drop policy if exists "Users can create their own analytics events"
on public.analytics_events;

create policy "Users can create their own analytics events"
on public.analytics_events
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
);

drop policy if exists "Users can delete their own analytics events"
on public.analytics_events;

create policy "Users can delete their own analytics events"
on public.analytics_events
for delete
to authenticated
using (
  (select auth.uid()) = user_id
);

revoke all
on table public.analytics_events
from public, anon, authenticated, service_role;

revoke all
on sequence public.analytics_events_id_seq
from public, anon, authenticated, service_role;

grant select, delete
on table public.analytics_events
to authenticated;

grant insert (
  client_event_id,
  user_id,
  event_name,
  failure_point,
  failure_class,
  attempt,
  platform,
  schema_version,
  occurred_at
)
on public.analytics_events
to authenticated;

grant usage
on sequence public.analytics_events_id_seq
to authenticated;

grant select, delete
on table public.analytics_events
to service_role;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'canal-analytics-retention'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'canal-analytics-retention',
    '17 3 * * *',
    $cron$
      delete from public.analytics_events
      where expires_at <= now()
    $cron$
  );
end;
$$;

comment on table public.analytics_events is
  'Consent-gated, enum-only Canal product analytics. No content payloads, URLs, tokens, emails, or raw errors.';

commit;
