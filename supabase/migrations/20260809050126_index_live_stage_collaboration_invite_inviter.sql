create index if not exists live_stage_collaboration_invites_inviter_index
  on public.live_stage_collaboration_invites (inviter_id);
