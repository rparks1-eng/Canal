import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "app/scenes/[sceneId].tsx"), "utf8");

describe("Scene detail composition", () => {
  it("reveals the Scene profile only inside the title card", () => {
    expect(source).toContain("profileVisible");
    expect(source).toContain('"Show Scene profile"');
    expect(source).toContain('"Hide Scene profile"');
    expect(source).toContain('accessibilityState={{ expanded: profileVisible }}');
    expect(source).toContain('accessibilityLabel="Scene profile details"');
    expect(source).not.toMatch(/styles\.sectionCard[\s\S]{0,180}>\s*Scene profile/u);
  });

  it("keeps the six utility controls visually free-standing", () => {
    const actionStyle = source.match(/actionButton:\s*\{([\s\S]*?)\n\s*\},/u)?.[1] ?? "";
    expect(actionStyle).toContain("width: 48");
    expect(actionStyle).toContain("height: 48");
    expect(actionStyle).not.toContain("backgroundColor");
    expect(actionStyle).not.toContain("borderWidth");
    expect(actionStyle).not.toContain("boxShadow");
  });

  it("makes First Up the playable lead row of Track sequence", () => {
    expect(source).toContain("styles.trackRowFirst");
    expect(source).toContain(">FIRST UP</Text>");
    expect(source).toContain('index === 0 ? `Start Scene with ${track.title}`');
    expect(source).toContain("index === 0\n                    ? void start()");
    expect(source).not.toContain("styles.firstUpArtwork");
  });
});
