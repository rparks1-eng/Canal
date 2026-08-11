import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "app/(tabs)/library.tsx"),
  "utf8",
);

describe("Library Scene DNA filters", () => {
  it("places search before the Scenes and Snapshots switch", () => {
    expect(source.indexOf('accessibilityLabel="Search your Library"')).toBeGreaterThan(-1);
    expect(source.indexOf('accessibilityLabel="Search your Library"')).toBeLessThan(
      source.indexOf('style={styles.sectionToggle}'),
    );
  });

  it("keeps collection and DNA filters as independent state", () => {
    expect(source).toContain('useState<LibraryFilter>');
    expect(source).toContain('useState<SnapshotFilter>("all")');
    expect(source).toContain('useState<LibraryDnaKind>("activity")');
    expect(source).toContain('const [dnaValue, setDnaValue] = useState("")');
    expect(source).toContain("filterHierarchy: {");
    expect(source).toContain('flexDirection: "column-reverse"');
    expect(source).toContain("secondaryFilterLabel: {");
  });

  it("orders Grid before List and removes collaboration from Library", () => {
    const layoutControls = source.slice(
      source.indexOf('["grid", "grid-outline"]'),
      source.indexOf("] as const", source.indexOf('["grid", "grid-outline"]')),
    );

    expect(layoutControls.indexOf('["grid", "grid-outline"]')).toBeLessThan(
      layoutControls.indexOf('["list", "list-outline"]'),
    );
    expect(source).not.toContain('accessibilityLabel="Open Scene collaboration"');
  });

  it("offers accessible activity, mood, and genre controls", () => {
    expect(source).toContain('"activity",');
    expect(source).toContain('"mood",');
    expect(source).toContain('"genre",');
    expect(source).toContain('accessibilityLabel={`Filter Library by ${kind}`}');
    expect(source).toContain('accessibilityLabel={`Filter by ${dnaKind} ${value}`}');
    expect(source).toContain('accessibilityLabel="Clear Scene DNA filter"');
  });

  it("composes DNA matching into both Scene and Snapshot results", () => {
    expect(source).toContain('!sceneDnaValues(scene, dnaKind).some');
    expect(source).toContain('const sourceScene = scenesById.get(snapshot.sceneId)');
    expect(source).toContain('!snapshotDna.some');
    expect(source).toContain('snapshot.mood');
    expect(source).toContain('snapshot.sceneActivity ?? sourceScene?.activity');
  });

  it("keeps every filter target at least 48 points tall", () => {
    expect(source).toMatch(/filterButton:\s*\{[\s\S]*?minHeight:\s*48/);
    expect(source).toMatch(/dnaValueButton:\s*\{[\s\S]*?minHeight:\s*48/);
    expect(source).toMatch(/dnaKindRow:\s*\{[\s\S]*?minHeight:\s*52/);
  });
});
