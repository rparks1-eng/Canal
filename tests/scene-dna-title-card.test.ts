import fs from "node:fs";
import path from "node:path";

const panel = fs.readFileSync(path.join(process.cwd(), "components/canal-ui/scene-dna-panel.tsx"), "utf8");
const detail = fs.readFileSync(path.join(process.cwd(), "app/scenes/[sceneId].tsx"), "utf8");
const publicDetail = fs.readFileSync(path.join(process.cwd(), "app/public-scene.tsx"), "utf8");

describe("Scene DNA title cards", () => {
  it("composes energy, mood, and genre into one bounded DNA panel", () => {
    expect(panel).toContain("SCENE DNA");
    expect(panel).toContain("SceneEnergySignature");
    expect(panel).toContain("SceneMoodBreakdown");
    expect(panel).toContain("SceneGenreBreakdown");
    expect(panel).toContain('width: "100%"');
    expect(panel).toContain("minWidth: 0");
  });

  it("renders Scene DNA inside both owned and public Scene title cards", () => {
    for (const source of [detail, publicDetail]) {
      expect(source).toContain("<SceneCardBackdrop");
      expect(source).toContain("<SceneDnaPanel");
      expect(source).toMatch(/hero:\s*\{[\s\S]*?overflow:\s*"hidden",/u);
    }
  });
});
