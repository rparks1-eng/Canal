create index if not exists live_stage_contributions_user_updated_index
on public.live_stage_contributions (user_id, updated_at desc);
