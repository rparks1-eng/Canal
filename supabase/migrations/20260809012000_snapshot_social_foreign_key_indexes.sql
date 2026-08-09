begin;

create index if not exists snapshot_likes_user_index
on public.snapshot_likes (user_id);

create index if not exists snapshot_comments_user_index
on public.snapshot_comments (user_id);

create index if not exists snapshot_comments_parent_snapshot_index
on public.snapshot_comments (parent_comment_id, snapshot_id)
where parent_comment_id is not null;

create index if not exists snapshot_comment_likes_comment_snapshot_index
on public.snapshot_comment_likes (comment_id, snapshot_id);

create index if not exists snapshot_comment_likes_user_index
on public.snapshot_comment_likes (user_id);

commit;
