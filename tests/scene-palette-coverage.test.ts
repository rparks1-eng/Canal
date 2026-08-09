import { sceneAtmosphere, scenePresentation } from "../components/canal-ui/scene-signature";
import { SCENE_MOOD_OPTIONS } from "../lib/scene-studio";

const paletteCases = [
  { id: "01", scene: { name: "Daylight Lift", activity: "explore", emotions: "happy", energy: "high", createdAt: "2026-08-09T13:00:00" } },
  { id: "02", scene: { name: "Training Heat", activity: "workout", emotions: "energized", energy: "high" } },
  { id: "03", scene: { name: "Deep Work", activity: "focus", emotions: "grounded", energy: "medium" } },
  { id: "04", scene: { name: "Quiet Reset", activity: "unwind", emotions: "calm", energy: "low" } },
  { id: "05", scene: { name: "Night Drive", activity: "commute", emotions: "reflective", energy: "medium", createdAt: "2026-08-09T22:00:00" } },
  { id: "06", scene: { name: "Dream Route", activity: "explore", emotions: "dreamy", energy: "medium" } },
  { id: "07", scene: { name: "Close Company", activity: "social", emotions: "romantic", energy: "medium" } },
  { id: "08", scene: { name: "Soft Interior", activity: "sleep", emotions: "warm", energy: "low" } },
  { id: "09", scene: { name: "Clear Morning", activity: "sleep", emotions: "clear", energy: "low", createdAt: "2026-08-09T07:00:00" } },
  { id: "10", scene: { name: "After Dark", activity: "party", emotions: "confident", energy: "high", createdAt: "2026-08-09T23:00:00" } },
] as const;

describe("Scene ten-palette coverage", () => {
  it.each(paletteCases)("maps generated Scene metadata to palette $id", ({ id, scene }) => {
    expect(scenePresentation(scene).templateId).toBe(id);
  });

  it("makes every palette visually distinct and exposes the missing Clear mood", () => {
    const presentations = paletteCases.map(({ scene }) => scenePresentation(scene));
    const templateIds = new Set(presentations.map(({ templateId }) => templateId));
    const gradients = new Set(presentations.map(({ colors }) => colors.join("|")));
    const bases = new Set(paletteCases.map(({ scene }) => sceneAtmosphere(scene).base));
    expect(templateIds.size).toBe(10);
    expect(gradients.size).toBe(10);
    expect(bases.size).toBe(10);
    expect(SCENE_MOOD_OPTIONS.some(({ value }) => value === "clear")).toBe(true);
  });
});
