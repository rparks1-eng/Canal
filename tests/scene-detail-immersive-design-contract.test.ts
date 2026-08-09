import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(__dirname, "..", "app", "scenes", "[sceneId].tsx"),
  "utf8",
);

describe("immersive Scene detail design", () => {
  it("extends the living Scene atmosphere behind the complete route", () => {
    expect(source).toContain("CanalAtmosphereContext");
    expect(source).toContain("setOverride(sceneAtmosphere(scene))");
    expect(source).toContain("setOverride(null)");
    expect(source).toContain('backgroundColor: "transparent"');
  });

  it("uses the Scene identity to drive the atmosphere", () => {
    expect(source).toContain("scenePresentation(scene)");
    expect(source).toContain("sceneAtmosphere(scene)");
    expect(source).not.toContain("<SceneSignature");
  });

  it("uses accessible glass with a Reduce Transparency fallback", () => {
    expect(source).toContain("useCanalReduceTransparency");
    expect(source).toContain("styles.glassSurface");
    expect(source).toContain("styles.solidSurface");
    expect(source).toContain('backgroundColor: "rgba(5, 42, 66, 0.62)"');
  });

  it("keeps artwork and replaces legacy dark or cream track surfaces", () => {
    expect(source).toContain("track.imageUrl");
    expect(source).toContain("style={styles.trackImage}");
    expect(source).not.toContain('backgroundColor:\n        "#2B1710"');
    expect(source).not.toContain('"#F0ECE8"');
    expect(source).not.toContain('"#F1E7DF"');
  });
});
