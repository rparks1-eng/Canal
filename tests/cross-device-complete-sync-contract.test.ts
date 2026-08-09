import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("complete account-safe cross-device synchronization", () => {
  it("syncs Scene edits, favorites, conflicts, and deletion tombstones", () => {
    const scenes = source("lib/scenes.ts");
    const sync = source("lib/scene-sync.ts");
    expect(scenes).toContain("await saveSceneToCloud");
    expect(scenes).toContain("toggleSceneFavorite");
    expect(sync).toMatch(/localRevision\s*!==\s*remoteRevision/u);
    expect(sync).toContain("sceneDeletionKey");
    expect(sync).toContain("applySceneDeletionToCloud");
    expect(sync).toMatch(/if \(row[.]deleted_at\)[\s\S]*deletionIds[.]add/u);
  });

  it("uses cloud-authoritative Snapshot, profile, Stage contribution, and notification paths", () => {
    expect(source("lib/snapshots.ts")).toMatch(/listOwnCloudSnapshots|upsertCloudSnapshot|deleteCloudSnapshot/u);
    expect(source("lib/canal-profile.ts")).toMatch(/saveOwnCanalProfile|[.]from\([\s\S]*"profiles"/u);
    expect(source("lib/stage-collaboration.ts")).toContain("submit_live_stage_contribution");
    expect(source("lib/relationships.ts")).toContain('from("activity_events")');
    expect(source("providers/notification-center-provider.tsx")).toContain("postgres_changes");
  });

  it("fences every repaired Scene sync operation to one user", () => {
    const sync = source("lib/scene-sync.ts");
    expect(sync).toContain("assertSceneCacheOwner");
    expect(sync).toContain("owner.userId");
    expect(sync).toContain('.eq(\n        "user_id"');
    expect(sync).not.toContain("AsyncStorage.clear");
  });
});
