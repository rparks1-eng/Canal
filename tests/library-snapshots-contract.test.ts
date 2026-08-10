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

  it("keeps Library overflow icons free-standing with accessible invisible targets", () => {
    expect(source).toMatch(/manageButtonGrid:\s*\{[\s\S]*?width:\s*48,[\s\S]*?height:\s*48,/u);
    const gridStyle = source.match(/manageButtonGrid:\s*\{([\s\S]*?)\n\s*\},/u)?.[1] ?? "";
    expect(gridStyle).not.toContain("backgroundColor");
    expect(gridStyle).not.toContain("borderWidth");
  });

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

  it("supports search, list/grid layouts, composed media, and Snapshot detail navigation", () => {
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
    expect(source).toContain("<SnapshotComposition");
    expect(source).toContain('pathname: "/snapshots/[snapshotId]"');
  });

  it("keeps Snapshot previews visual-first and renders only real notes on one line", () => {
    const composition = fs.readFileSync(
      path.join(process.cwd(), "components", "snapshot-composition.tsx"),
      "utf8",
    );
    expect(composition).toContain("{snapshot.note ? (");
    expect(composition).toContain("numberOfLines={1}");
    expect(source).not.toContain("No note added");
    expect(source).not.toContain("styles.snapshotMetaRow");
    expect(source).not.toContain("styles.snapshotCopy");
  });

  it("provides a compact three-dot quick-actions menu without duplicating detail editing", () => {
    expect(source).toContain('name="ellipsis-horizontal"');
    expect(source).toContain("openSnapshotActions(snapshot)");
    expect(source).not.toContain('text: "Edit"');
    expect(source).toContain("<LibraryActionLedge");
    expect(source).toContain('right: 48');
    expect(source).toContain('maxWidth: 156');
    expect(source).toContain('entering={FadeInRight.duration(170)}');
    expect(source).toContain('style={styles.actionLedgeAnchor}');
    expect(source).toContain('style={styles.actionLedge}');
    expect(source).not.toContain("accessibilityViewIsModal");
    expect(source).toContain('label: snapshot.visibility === "public" ? "Make Private" : "Make Public"');
    expect(source).toContain('label: "Share Snapshot"');
    expect(source).toContain('label: "Delete Snapshot"');
  });

  it("executes Scene actions from the anchored ledge while keeping destructive confirmation bounded", () => {
    expect(source).toContain('label: scene.libraryType === "saved" ? "Remove from Library" : "Delete Scene"');
    expect(source).toContain("void performDelete(scene)");
    expect(source).toContain("const confirmSceneDelete = (scene: StoredScene): void => {");
    expect(source).toContain('removingSavedScene ? "Remove Scene?" : "Delete Scene?"');
    expect(source).toContain("confirmSceneDelete(scene)");
  });

  it("dismisses the ledge after a meaningful drag or any outside tap", () => {
    expect(source).toContain("const LIBRARY_MENU_SCROLL_DISMISS_DISTANCE = 12");
    expect(source).toContain("scrollStartY.current = event.nativeEvent.contentOffset.y");
    expect(source).toContain("LIBRARY_MENU_SCROLL_DISMISS_DISTANCE");
    expect(source).toContain("scrollEventThrottle={16}");
    expect(source).toContain("onTouchEnd={() => {");
    expect(source).toContain("if (openActions) setOpenActions(null)");
    expect(source).toContain('onTouchStart={(event) => event.stopPropagation()}');
    expect(source).toContain('onTouchEnd={(event) => event.stopPropagation()}');
    expect(source).not.toContain("onTouchStart={() => {");
    expect(source).not.toContain("onScrollBeginDrag={() => setOpenActions(null)}");
  });
});
