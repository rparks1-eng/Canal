import fs from "node:fs";
import path from "node:path";

const libraryPath = path.join(
  process.cwd(),
  "app",
  "(tabs)",
  "library.tsx",
);

describe("Library Snapshot collection contract", () => {
  const source = fs.readFileSync(libraryPath, "utf8");

  it("loads the full account-scoped Snapshot collection whenever Library focuses", () => {
    expect(source).toContain("readSnapshotsWithStatus");
    expect(source).toContain("setSnapshots(snapshotResult.value)");
    expect(source).toMatch(/useFocusEffect[\s\S]*void load\(\)/u);
    expect(source).not.toContain("listPublicSnapshots");
  });

  it("makes Snapshots a first-class Library section with useful filters", () => {
    expect(source).toContain('type LibrarySection =');
    expect(source).toContain('"snapshots"');
    expect(source).toContain('["all", "public", "private", "photo", "video"]');
    expect(source).toContain("snapshot.visibility === snapshotFilter");
    expect(source).toContain("snapshot.mediaType === snapshotFilter");
  });

  it("supports search, list/grid layouts, artwork, and Snapshot detail navigation", () => {
    for (const field of [
      "snapshot.sceneName",
      "snapshot.sceneActivity",
      "snapshot.trackTitle",
      "snapshot.trackArtist",
      "snapshot.note",
      "snapshot.mood",
    ]) {
      expect(source).toContain(field);
    }

    expect(source).toContain('layout === "grid" && styles.snapshotCardGrid');
    expect(source).toContain("snapshot.mediaUri || snapshot.trackImageUrl");
    expect(source).toContain('pathname: "/snapshots/[snapshotId]"');
  });

  it("provides a standard three-dot management menu for every Snapshot", () => {
    expect(source).toContain('name="ellipsis-horizontal"');
    expect(source).toContain("openSnapshotActions(snapshot)");
    expect(source).toContain('text: "Edit"');
    expect(source).toContain('text: snapshot.visibility === "public" ? "Make Private" : "Make Public"');
    expect(source).toContain('text: "Share"');
    expect(source).toContain('text: "Delete"');
  });
});
