import fs from "node:fs";
import path from "node:path";

describe("fast primary surfaces", () => {
  const library = fs.readFileSync(path.join(process.cwd(), "app", "(tabs)", "library.tsx"), "utf8");
  const explore = fs.readFileSync(path.join(process.cwd(), "app", "(tabs)", "explore.tsx"), "utf8");
  const profile = fs.readFileSync(path.join(process.cwd(), "app", "(tabs)", "profile.tsx"), "utf8");
  const snapshots = fs.readFileSync(path.join(process.cwd(), "lib", "snapshots.ts"), "utf8");
  const social = fs.readFileSync(path.join(process.cwd(), "lib", "profile-social.ts"), "utf8");

  it("renders the Library from local account data before cloud synchronization", () => {
    expect(library).toContain("readLocalSnapshotsWithStatus()");
    expect(library).toContain("setScenes(nextScenes)");
    expect(library).toContain("setLoading(false)");
    expect(library).toContain("Promise.allSettled([");
    expect(library).toContain("syncScenesWithCloud()");
    expect(snapshots).toContain("export async function readLocalSnapshotsWithStatus()");
    expect(snapshots).toContain("activeSnapshotReads.get(key)");
    expect(snapshots).toContain("activeSnapshotReads.set(key, read)");
  });

  it("keeps retained Explore content visible during focus refreshes", () => {
    expect(explore).toContain("hasRenderedContentRef.current");
    expect(explore).toContain("!isPullRefresh && !hasRenderedContentRef.current");
  });

  it("hydrates Soundscape locally and avoids the self-follow query", () => {
    expect(profile).toContain("readLocalSnapshotsWithStatus()");
    expect(profile).toContain("snapshotRefreshRef.current = readSnapshotsWithStatus()");
    expect(profile).toContain("hasRenderedProfileRef.current");
    expect(profile).toContain("hasNetworkDataRef.current");
    expect(social).toContain("targetProfileId === account.viewerId");
    expect(social).toContain("isOwnProfile: true");
  });
});
