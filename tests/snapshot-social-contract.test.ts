import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");

describe("Snapshot social contract", () => {
  const migration = fs.readFileSync(
    path.join(root, "supabase/migrations/20260809011000_snapshot_social_interactions.sql"),
    "utf8",
  );
  const repository = fs.readFileSync(path.join(root, "lib/snapshot-social.ts"), "utf8");
  const detail = fs.readFileSync(path.join(root, "app/snapshots/[snapshotId].tsx"), "utf8");
  const activity = fs.readFileSync(path.join(root, "components/activity-screen.tsx"), "utf8");
  const recursionFix = fs.readFileSync(
    path.join(root, "supabase/migrations/20260809013500_snapshot_comment_policy_recursion_fix.sql"),
    "utf8",
  );

  it("stores likes, threaded comments and comment likes behind RLS", () => {
    expect(migration).toContain("create table if not exists public.snapshot_likes");
    expect(migration).toContain("create table if not exists public.snapshot_comments");
    expect(migration).toContain("create table if not exists public.snapshot_comment_likes");
    expect(migration).toContain("parent_comment_id uuid");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("private.canal_users_are_blocked");
    expect(migration).toContain("char_length(btrim(body)) between 1 and 500");
  });

  it("creates durable activity targets without allowing client trigger execution", () => {
    expect(migration).toContain("add column if not exists snapshot_id text");
    expect(migration).toContain("add column if not exists comment_id uuid");
    expect(migration).toContain("revoke all on function private.notify_snapshot_social_activity()");
    expect(migration).toContain("create trigger snapshot_comments_notify_activity");
    expect(activity).toContain('pathname: "/snapshots/[snapshotId]"');
    expect(activity).toContain("item.commentId");
  });

  it("guards every write with the current signed-in account", () => {
    expect(repository.match(/await assertCurrentUser\(safeUserId\)/g)?.length).toBeGreaterThanOrEqual(8);
    expect(repository).toContain('channel(`snapshot-social:${safeSnapshotId}`)');
    expect(repository).not.toContain("AsyncStorage");
  });

  it("relies on the composite reply foreign key without recursively reading comment RLS", () => {
    expect(recursionFix).toContain('create policy "Users can comment on accessible Snapshots"');
    expect(recursionFix).not.toContain("from public.snapshot_comments as parent");
    expect(migration).toContain("foreign key (parent_comment_id, snapshot_id)");
  });

  it("renders the composition with comment-triggered conversation and modal management", () => {
    expect(detail).toContain("<SnapshotComposition");
    expect(detail).toContain("snapshot={snapshot}");
    expect(detail).toContain("height={500}");
    expect(detail).toContain("Like Snapshot");
    expect(detail).toContain("Write a reply");
    expect(detail).toContain("Post comment");
    expect(detail).toContain("Manage Snapshot");
    expect(detail).toContain("showManagement");
    expect(detail).toContain("showConversation");
    expect(detail).toContain("setShowConversation((value) => !value)");
    expect(detail).toContain('<Modal');
    expect(detail).toContain('name="ellipsis-horizontal"');
  });
});
