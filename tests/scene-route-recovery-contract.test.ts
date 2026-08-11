import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";

const ROOT = resolve(__dirname, "..");

function source(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

describe("immersive route recovery contract", () => {
  it.each([
    "app/scene-preview.tsx",
    "app/now-playing.tsx",
    "app/scene-snapshot.tsx",
  ])("reloads %s on focus and reconnect with visible recovery", (path) => {
    const value = source(path);
    expect(value).toContain("useFocusEffect");
    expect(value).toContain("useReconnectReload");
    expect(value).toContain("RecoveryNotice");
  });

  it("keeps Scene route async work fenced to the current account/load", () => {
    expect(source("app/scene-preview.tsx")).toContain("sameSceneStudioScope");
    expect(source("app/now-playing.tsx")).toContain("playerLoadGenerationRef");
    expect(source("app/scene-snapshot.tsx")).toContain("sceneLoadGeneration");
  });

  it.each([
    "app/scene-preview.tsx",
    "app/now-playing.tsx",
    "app/scene-snapshot.tsx",
    "app/event-run-sheets/index.tsx",
    "app/event-run-sheets/new.tsx",
    "app/event-run-sheets/[runSheetId].tsx",
  ])("keeps %s back/header controls at least 48pt", (path) => {
    const value = source(path);
    expect(value).toMatch(/(?:backButton|headerButton):\s*\{[\s\S]{0,120}(?:height|minHeight):\s*48/u);
    expect(value).toMatch(/(?:backButton|headerButton):\s*\{[\s\S]{0,120}width:\s*48/u);
  });

  it("keeps the legacy Event Run Sheet route as a non-interactive redirect", () => {
    const value = source("app/event-run-sheet.tsx");
    expect(value).toContain("LegacyEventRunSheetRedirect");
    expect(value).toContain("<Redirect");
    expect(value).not.toContain("Pressable");
  });
});
