import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");

describe("Supabase performance contracts", () => {
  const liveStages = fs.readFileSync(path.join(root, "lib/live-stages.ts"), "utf8");
  const snapshotSocial = fs.readFileSync(path.join(root, "lib/snapshot-social.ts"), "utf8");
  const explore = fs.readFileSync(path.join(root, "app/(tabs)/explore.tsx"), "utf8");
  const category = fs.readFileSync(path.join(root, "app/(tabs)/explore-category.tsx"), "utf8");
  const migration = fs.readFileSync(
    path.join(root, "supabase/migrations/20260810211012_optimize_public_read_paths.sql"),
    "utf8",
  );

  it("filters public live Stages before ordering and limiting", () => {
    expect(liveStages).toContain('export async function readPublicLiveStages(');
    expect(liveStages).toMatch(
      /\.eq\("status", "live"\)\s*\.eq\("visibility", "public"\)\s*\.order\("updated_at"/,
    );
    expect(explore).toContain("readPublicLiveStages({ force: isPullRefresh })");
    expect(category).toContain("readPublicLiveStages()");
  });

  it("deduplicates and briefly caches account-scoped public Stage reads", () => {
    expect(liveStages).toContain("PUBLIC_STAGE_CACHE_TTL_MS = 20_000");
    expect(liveStages).toContain("publicStageCache.get(currentUserId)");
    expect(liveStages).toContain("publicStageReads.get(currentUserId)");
    expect(liveStages).toContain("publicStageCache.set(currentUserId");
  });

  it("shares one Realtime channel per Stage or Snapshot until the final cleanup", () => {
    expect(liveStages).toContain("cloudLiveStageSubscriptions.get(stageId)");
    expect(liveStages).toContain("current.subscribers.size > 0");
    expect(snapshotSocial).toContain("snapshotSocialSubscriptions.get(safeSnapshotId)");
    expect(snapshotSocial).toContain("current.listeners.size > 0");
    expect(liveStages).toContain("supabase.removeChannel(current.channel)");
    expect(snapshotSocial).toContain("supabase.removeChannel(current.channel)");
  });

  it("renders public Stages before bounded artwork hydration completes", () => {
    expect(explore).toContain("setStages(publicStages)");
    expect(explore).toContain("loadRequestId.current === requestId");
    expect(explore).toContain("offset += 4");
  });

  it("indexes the exact public Snapshot source-gallery predicate", () => {
    expect(migration).toContain("snapshots_public_scene_updated_index");
    expect(migration).toMatch(/scene_id,\s*updated_at desc,\s*id/);
    expect(migration).toContain("where visibility = 'public'");
    expect(migration).not.toMatch(/vacuum full|delete from|drop table/i);
  });
});
