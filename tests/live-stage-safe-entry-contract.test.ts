import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const stage = fs.readFileSync(path.join(root, "app/live-stage/[stageId].tsx"), "utf8");
const scene = fs.readFileSync(path.join(root, "app/scenes/[sceneId].tsx"), "utf8");

describe("Live Stage safe-area and Scene entry contract", () => {
  it("keeps the active Stage below an opaque native header with reachable controls", () => {
    expect(stage).toMatch(/title:\s*stage[.]name[\s\S]*headerTransparent:\s*false/u);
    expect(stage).toContain('accessibilityLabel="Back from Stage"');
    expect(stage).toContain('accessibilityLabel="Play next Stage track"');
    expect(stage).toMatch(/headerBack:\s*\{[\s\S]*height:\s*48[\s\S]*width:\s*48/u);
    expect(stage).toMatch(/nextTrackButton:\s*\{[\s\S]*minHeight:\s*50/u);
  });

  it("offers an owned-Scene broadcast shortcut with the Scene preselected", () => {
    expect(scene).toContain('name="radio-outline"');
    expect(scene).toContain('accessibilityLabel={`Start a live Stage with ${scene.name}`}');
    expect(scene).toContain('pathname: "/create-stage"');
    expect(scene).toContain('params: { sceneId: scene.id }');
  });
});
