import { buildSceneReshootDraft } from "../lib/scene-reshoot";
import type { StoredScene } from "../lib/scenes";

function scene(id: string, overrides: Partial<StoredScene> = {}): StoredScene {
  return { id, name:id, activity:"Focus", duration:"35 min", emotions:"Calm, Curious", genres:"Dream pop, Ambient", energy:"medium", familiarity:"balanced", artists:"", artistSelections:"", songRequest:"", avoid:"", collaborators:[], tracks:[], visibility:"private", createdAt:"2026-01-01T00:00:00.000Z", updatedAt:"2026-01-01T00:00:00.000Z", libraryType:"created", ...overrides };
}

describe("Scene Reshoot", () => {
  it("prefills a distinct draft from public inspiration and bounded personal Scenes", () => {
    const draft = buildSceneReshootDraft(scene("Source", { activity:"Workout", emotions:"Energized", genres:"Pop" }), [scene("Mine", { emotions:"Confident", genres:"R&B" })]);
    expect(draft.activity).toBe("workout");
    expect(draft.moods).toEqual(expect.arrayContaining(["energized", "confident"]));
    expect(draft.preferredGenres).toEqual(["Pop", "R&B"]);
    expect(draft.notes).toContain("Source");
    expect(draft.notes).toContain("Mine");
    expect(draft.name).toBe("");
  });
});
