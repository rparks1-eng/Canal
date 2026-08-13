import {
  readFileSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

const source = readFileSync(
  resolve(__dirname, "../app/scene-preview.tsx"),
  "utf8",
);

describe("Scene Preview account scope", () => {
  it("reads only a matching scoped preview and quarantines stale invalidations", () => {
    expect(source).toContain("useAuth");
    expect(source).toContain("accountEpoch");
    expect(source).toContain("sessionGeneration");
    expect(source).toContain("captureSceneStudioScope");
    expect(source).toContain("readPreview");
    expect(source).toContain("loadedScope");
    expect(source).toContain("sceneStudioScopeIsVisible");
    expect(source).toContain("captureSceneStudioInvalidationGeneration");
    expect(source).toContain("sceneStudioInvalidationGenerationIsCurrent");
    expect(source).toContain("setLoadedScope(null)");
    expect(source).toContain("setHasScopedPreview(false)");
    expect(source).toContain('invalidation.reason === "device-clear"');
    expect(source).toContain("setLoadedScope(operationScope)");
    expect(source).toContain("setLoading(false)");
    expect(source).toContain("registerSceneStudioInvalidationHandler");
    expect(source).not.toContain("readGeneratedScenePreview");
    expect(source).toContain("readCombinedSceneMusicLibrary");
    expect(source).toContain("musicProviders.require(providerId, \"catalog-search\")");
    expect(source).toContain("sameSceneStudioScope(operationScope, currentScope())");
  });
});
