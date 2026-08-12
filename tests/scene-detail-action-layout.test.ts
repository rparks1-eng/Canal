import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "app/scenes/[sceneId].tsx"),
  "utf8",
);

describe("Scene detail action hierarchy", () => {
  it("keeps the overflow menu in the page header", () => {
    const headerStart = source.indexOf('<View style={styles.header}>');
    const scrollStart = source.indexOf("<ScrollView", headerStart);
    const manageScene = source.indexOf('accessibilityLabel="Manage Scene"');

    expect(manageScene).toBeGreaterThan(headerStart);
    expect(manageScene).toBeLessThan(scrollStart);
    expect(source).toContain("style={styles.pageMenuArea}");
  });

  it("places Duplicate in the top-left of the title card", () => {
    expect(source).toContain('accessibilityLabel="Duplicate Scene"');
    expect(source).toContain("styles.heroDuplicate");
    expect(source).toMatch(/heroDuplicate:\s*\{[\s\S]*?top:\s*8,[\s\S]*?left:\s*8,/);
  });

  it("orders the remaining row Collaborate, Snapshot, Export", () => {
    const rowStart = source.indexOf('<View style={styles.actionGrid}>');
    const rowEnd = source.indexOf("</View>", source.indexOf('name="musical-notes-outline"', rowStart));
    const row = source.slice(rowStart, rowEnd);

    const collaborate = row.indexOf('accessibilityLabel="Manage Scene collaboration"');
    const snapshot = row.indexOf('accessibilityLabel="Create Snapshot"');
    const exportPlaylist = row.indexOf('"Export Scene playlist"');

    expect(collaborate).toBeGreaterThan(-1);
    expect(snapshot).toBeGreaterThan(collaborate);
    expect(exportPlaylist).toBeGreaterThan(snapshot);
    expect(row).not.toContain('accessibilityLabel="Duplicate Scene"');
  });

  it("retains 48 point touch targets", () => {
    expect(source).toMatch(/pageMenuButton:\s*\{[\s\S]*?width:\s*48,[\s\S]*?height:\s*48,/);
    expect(source).toMatch(/heroDuplicate:\s*\{[\s\S]*?width:\s*48,[\s\S]*?height:\s*48,/);
    expect(source).toMatch(/actionButton:\s*\{[\s\S]*?width:\s*48,[\s\S]*?height:\s*48,/);
  });

  it("animates the profile reveal and its full-card background together", () => {
    expect(source).toContain("const profileProgress = useSharedValue(0)");
    expect(source).toContain("maxHeight: 250 * profileProgress.value");
    expect(source).toContain("marginTop: 15 * profileProgress.value");
    expect(source).toContain("duration: reduceMotion ? 0 : 460");
    expect(source).toContain("Easing.bezier(0.22, 1, 0.36, 1)");
    expect(source).toContain("<SceneCardBackdrop presentation={presentation} scene={scene} />");
    expect(source).not.toContain("heroBackdropCanvas");
    expect(source).toContain('pointerEvents={profileVisible ? "auto" : "none"}');
  });
});
