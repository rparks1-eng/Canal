import fs from "node:fs";
import path from "node:path";

import { sceneAtmosphere, scenePresentation, stagePresentation } from "../components/canal-ui/scene-signature";
import { LIVING_COVER_RECIPES } from "../lib/living-covers";
import { SCENE_MOOD_OPTIONS } from "../lib/scene-studio";

const paletteCases = [
  { templateId: "living-solar", scene: { name: "Daylight Lift", activity: "morning", emotions: "happy", genres: "disco", energy: "high", createdAt: "2026-08-09T08:00:00" } },
  { templateId: "living-ember", scene: { name: "Training Heat", activity: "workout", emotions: "energized", genres: "rock", energy: "high" } },
  { templateId: "living-verdant", scene: { name: "Deep Work", activity: "focus", emotions: "grounded", genres: "lo-fi", energy: "medium" } },
  { templateId: "living-tide", scene: { name: "Quiet Reset", activity: "unwind", emotions: "calm", genres: "ambient", energy: "low" } },
  { templateId: "living-cobalt", scene: { name: "Night Drive", activity: "commute", emotions: "confident", genres: "hip-hop", energy: "high" } },
  { templateId: "living-violet", scene: { name: "Dream Route", activity: "create", emotions: "dreamy", genres: "indie", energy: "medium" } },
  { templateId: "living-rose", scene: { name: "Close Company", activity: "social", emotions: "romantic", genres: "r&b", energy: "medium" } },
  { templateId: "living-copper", scene: { name: "Sunday Kitchen", activity: "cook", emotions: "warm", genres: "folk", energy: "low", createdAt: "2026-08-09T18:00:00" } },
  { templateId: "living-silver", scene: { name: "Quiet Geometry", activity: "focus", emotions: "reflective", genres: "jazz", energy: "low" } },
  { templateId: "living-midnight", scene: { name: "After Dark", activity: "party", emotions: "intense", genres: "trap", energy: "high", createdAt: "2026-08-09T23:00:00" } },
] as const;

describe("Scene ten-palette coverage", () => {
  it("ships exactly ten named, visually distinct palette templates", () => {
    expect(LIVING_COVER_RECIPES).toHaveLength(10);
    expect(new Set(LIVING_COVER_RECIPES.map(({ templateId }) => templateId)).size).toBe(10);
    expect(new Set(LIVING_COVER_RECIPES.map(({ gradient }) => gradient.join("|"))).size).toBe(10);
  });

  it.each(paletteCases)("maps Scene metadata to $templateId", ({ templateId, scene }) => {
    expect(scenePresentation(scene).templateId).toBe(templateId);
  });

  it("uses the same deterministic result for Scene and Stage data", () => {
    const scene = paletteCases[6].scene;
    expect(stagePresentation({
      name: scene.name,
      activity: scene.activity,
      atmosphereSignals: [scene.emotions, scene.genres, scene.energy],
    }).templateId).toBe(scenePresentation(scene).templateId);
  });

  it("exposes all distinct atmospheres and the Clear mood", () => {
    const bases = new Set(paletteCases.map(({ scene }) => sceneAtmosphere(scene).base));
    expect(bases.size).toBe(10);
    expect(SCENE_MOOD_OPTIONS.some(({ value }) => value === "clear")).toBe(true);
  });

  it("uses the shared palette visual on Home, Explore, and Library", () => {
    const root = path.resolve(__dirname, "..");
    for (const file of ["app/(tabs)/index.tsx", "app/(tabs)/explore.tsx", "app/(tabs)/library.tsx"]) {
      const source = fs.readFileSync(path.join(root, file), "utf8");
      expect(source).toContain("SceneCardBackdrop");
      expect(source).toContain("scenePresentation");
    }
    const explore = fs.readFileSync(path.join(root, "app/(tabs)/explore.tsx"), "utf8");
    expect(explore).toContain("stagePresentation(stage)");
  });
});
