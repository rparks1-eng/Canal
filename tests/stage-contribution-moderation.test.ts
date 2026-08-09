import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260809173000_live_stage_contribution_moderation.sql"), "utf8");
const client = fs.readFileSync(path.join(root, "lib/stage-collaboration.ts"), "utf8");
const lobby = fs.readFileSync(path.join(root, "app/stage-lobby/[stageId].tsx"), "utf8");

describe("collaborative Stage contribution moderation", () => {
  it("adds host-only approval, rejection, removal, revision history, and rollback", () => {
    expect(migration).toContain("moderation_status in ('pending', 'approved', 'rejected')");
    expect(migration).toContain("stage.host_id = (select auth.uid())");
    expect(migration).toContain("moderate_live_stage_contribution");
    expect(migration).toContain("rollback_live_stage_mix");
    expect(migration).toContain("archive_live_stage_mix_revision");
    expect(migration).toContain("ready = action_value = 'approve'");
    expect(migration).toContain("on delete cascade");
  });

  it("resets moderation on a new contribution and rebuilds accepted changes", () => {
    expect(migration).toContain("reset_live_stage_contribution_moderation");
    expect(migration).toContain("new.moderation_status := 'pending'");
    expect(migration).toContain("new.ready := false");
    expect(migration).toContain("perform private.refresh_live_stage_mix(stage_id_value)");
    expect(migration).toContain("moderation_status <> 'rejected'");
    expect(migration).toContain("set tracks = collaboration_base_tracks");
  });

  it("prevents public enumeration and supports collaborator code joins", () => {
    expect(migration).toContain("member.user_id = (select auth.uid())");
    expect(migration).toContain("join_live_stage_as_collaborator_by_code");
    expect(migration).toContain("values (matched_stage_id, current_user_id, 'collaborator')");
  });

  it("wires decision and rollback controls through account-guarded client functions", () => {
    expect(client).toContain('supabase.rpc("moderate_live_stage_contribution"');
    expect(client).toContain('supabase.rpc("rollback_live_stage_mix"');
    expect(client).toContain("await assertSameUser(userId)");
    expect(client).toContain("expected_contribution_revision_value");
    expect(client).toContain("expected_stage_updated_at_value");
    expect(lobby).toContain("Approve ${item.displayName} contribution");
    expect(lobby).toContain("Reject ${item.displayName} contribution");
    expect(lobby).toContain("Remove ${item.displayName} contribution");
    expect(lobby).toContain('accessibilityLabel="Restore previous Stage mix"');
  });
});
