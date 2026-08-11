import fs from "node:fs";
import path from "node:path";

describe("Scene Studio edit regeneration contract", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "app/scene-studio.tsx"),
    "utf8",
  );

  it("replaces the prior playlist after edited parameters are submitted", () => {
    const editBranch = source.slice(
      source.indexOf('if (shouldResumePreview && existing.kind === "ready")'),
      source.indexOf("} else {", source.indexOf('if (shouldResumePreview && existing.kind === "ready")')),
    );

    expect(editBranch).toContain(
      "regenerateGeneratedSceneEditor(existing.value, candidates)",
    );
    expect(editBranch).not.toContain("refillGeneratedSceneToDuration");
    expect(editBranch).not.toContain("updateUserDirectedScenePreview");
    expect(editBranch).toContain(
      "...existing.value.trackSignals.map((signal) => signal.track.id)",
    );
  });
});
