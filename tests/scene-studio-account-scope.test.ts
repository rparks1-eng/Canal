import {
  readFileSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

const source = readFileSync(
  resolve(__dirname, "../app/scene-studio.tsx"),
  "utf8",
);

describe("Scene Studio account-scoped provider-unavailable route", () => {
  it("uses durable auth scope around saved-snapshot generation without syncing", () => {
    expect(source).toContain("useAuth");
    expect(source).toContain("accountEpoch");
    expect(source).toContain("sessionGeneration");
    expect(source).toContain("captureSceneStudioScope");
    expect(source).toContain("readDraft");
    expect(source).toContain("saveDraft");
    expect(source).toContain("loadedScope");
    expect(source).toContain("sceneStudioScopeIsVisible");
    expect(source).toContain("captureSceneStudioInvalidationGeneration");
    expect(source).toContain("sceneStudioInvalidationGenerationIsCurrent");
    expect(source).toContain("setLoadedScope(null)");
    expect(source).toContain("setDraft(freshDraft())");
    expect(source).toContain('invalidation.reason === "device-clear"');
    expect(source).toContain("skipNextAutosaveRef.current = true");
    expect(source).toContain("setLoadedScope(operationScope)");
    expect(source).toContain("Studio draft cleared from this device.");
    expect(source).toContain("captureSpotifyCanalAccountGuard");
    expect(source).toContain("readSpotifyConnectionStateForAccount");
    expect(source).not.toContain("getLatestSpotifyLibrarySnapshot");
    expect(source).not.toContain("syncSpotifyLibrary");
    expect(source).toContain("readSpotifyLibrarySnapshot");
    expect(source).toContain("generateSceneWithSpotifyGenreFallback");
    expect(source).toContain("sameSpotifyAccountGuard");
    expect(source).not.toContain("readSceneStudioDraft");
  });
});
