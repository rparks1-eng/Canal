import fs from "node:fs";
import path from "node:path";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("owned Snapshot Soundscape contract", () => {
  it("keeps Snapshot persistence account-scoped instead of adding a second global index", () => {
    const snapshots = read("lib/snapshots.ts");
    expect(snapshots).toContain("getSnapshotStorageKey");
    expect(snapshots).not.toContain("addSnapshotToSoundscape");
    expect(snapshots).not.toContain("removeSnapshotFromSoundscape");
  });

  it("shows all owned Snapshots on the profile and filters visibility separately", () => {
    const profile = read("app/(tabs)/profile.tsx");
    expect(profile).toContain("setSoundscapeSnapshots(snapshotResult.value)");
    expect(profile).toContain('["all", "public", "private"]');
    expect(profile).toContain('snapshot.visibility === snapshotVisibilityFilter');
    expect(profile).toContain("Visibility only controls what other people can see.");
  });

  it("derives the owner Soundscape from all Snapshots instead of a manual featured list", () => {
    const collector = read("lib/soundscape-collector.ts");
    const detail = read("app/snapshots/[snapshotId].tsx");
    expect(collector).toContain("readSnapshots");
    expect(collector).toContain("snapshots.slice(0, 250).map");
    expect(collector).toContain("snapshot.visibility === \"public\"");
    expect(detail).toContain("Saved to your Soundscape");
    expect(detail).not.toContain("Add to Soundscape");
  });
});
