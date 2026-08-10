import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Scene feedback event semantics", () => {
  it("records the user's replacement judgment before generating or mutating a replacement", () => {
    const preview = read("app/scene-preview.tsx");
    const handler = preview.slice(
      preview.indexOf("const replaceTrack = useCallback"),
      preview.indexOf("const controlsBusy"),
    );
    const feedbackIndex = handler.indexOf("await recordSceneRecommendationFeedback");
    expect(feedbackIndex).toBeGreaterThan(-1);
    expect(feedbackIndex).toBeLessThan(handler.indexOf("await generateAlternative"));
    expect(feedbackIndex).toBeLessThan(handler.indexOf("await mutatePreview"));
    expect(handler).toContain('action: mismatch ? "doesnt_match" : "remove"');
    expect(handler).toContain("reasons: mismatch ? reasons : []");
    expect(handler).toContain("...(mismatch && context ? context : {})");
    expect(handler).toContain("const feedbackResult = await recordSceneRecommendationFeedback");
    expect(handler).toContain('feedbackResult.outcome === "skipped"');
    expect(handler).toContain("sameSceneStudioScope(operationScope, currentScope())");
    expect(handler).toContain("feedbackWasSaved");
    expect(handler).toContain("your feedback could not be saved");
    expect(handler).not.toContain('action: mismatch ? "swap" : "remove"');
    expect((handler.match(/recordSceneRecommendationFeedback/gu) ?? [])).toHaveLength(1);
  });

  it("offers optional bounded mismatch reasons without weakening Swap", () => {
    const preview = read("app/scene-preview.tsx");
    expect(preview).toContain("SCENE_FEEDBACK_REASONS.map");
    expect(preview).toContain("SCENE_FEEDBACK_REASON_LABELS[reason]");
    expect(preview).toContain('accessibilityRole="checkbox"');
    expect(preview).toContain("accessibilityState={{ checked, disabled: controlsBusy }}");
    expect(preview).toContain("current.length >= MAX_SCENE_FEEDBACK_REASONS");
    expect(preview).toContain("confirmMismatchSwap([])");
    expect(preview).toContain("confirmMismatchSwap(mismatchReasons)");
    expect(preview).toContain(">Skip reasons<");
    expect(preview).toContain(">Swap track<");
    expect(preview).toMatch(/reasonChip:[\s\S]*minHeight: 48/u);
    expect(preview).toMatch(/reasonSecondary:[\s\S]*minHeight: 48/u);
    expect(preview).toMatch(/reasonPrimary:[\s\S]*minHeight: 48/u);
    expect(preview).toContain("<Modal");
    expect(preview).toContain("accessibilityViewIsModal");
    expect(preview).toContain('accessibilityLabel="Cancel track swap"');
    expect(preview).toContain("AccessibilityInfo.setAccessibilityFocus");
    expect(preview).toContain("swapButtonRefs.current.get(trackId)");
    expect(preview).toContain("Swap canceled. The playlist is unchanged.");
    expect(preview).toContain('<SafeAreaView edges={["bottom"]} style={styles.reasonBackdrop}>');
    expect(preview).toContain("contentContainerStyle={styles.reasonScrollContent}");
    expect(preview).toMatch(/reasonPanel:\s*\{[\s\S]*?maxHeight: "88%",/u);
    expect(preview).toMatch(/reasonTitle:\s*\{[\s\S]*?flex: 1,[\s\S]*?flexShrink: 1,/u);
  });

  it("regenerates only after a bounded, measurable playlist change", () => {
    const preview = read("app/scene-preview.tsx");
    const handler = preview.slice(
      preview.indexOf("const regenerateScene = useCallback"),
      preview.indexOf("const replaceTrack = useCallback"),
    );
    expect(preview).toContain("const MAX_REGENERATION_ATTEMPTS = 3");
    expect(preview).toContain("const MIN_REGENERATION_CHANGE_RATIO = 0.3");
    expect(preview).toContain("function regenerationChangeRatio");
    expect(handler).toContain("attempt < MAX_REGENERATION_ATTEMPTS");
    expect(handler).toContain("regenerationChangeRatio(current, candidate)");
    expect(handler).toContain("if (!materiallyDifferent)");
    expect(handler).toContain("Your playlist is unchanged.");
    expect(handler.indexOf("if (!materiallyDifferent)")).toBeLessThan(
      handler.indexOf("await mutatePreview"),
    );
  });

  it("captures bounded track context before the replacement removes the signal", () => {
    const preview = read("app/scene-preview.tsx");
    expect(preview).toContain("artistIds: (signal.track.artists ?? [])");
    expect(preview).toContain("genres: [...signal.genres]");
    expect(preview).toContain("explicit: signal.track.explicit === true");
    expect(preview).toContain("artistIds: pending.artistIds");
    expect(preview).toContain("genres: pending.genres");
    expect(preview).toContain("explicit: pending.explicit");
  });

  it("keeps compact reorder and remove controls in separate 48-point targets", () => {
    const preview = read("app/scene-preview.tsx");
    const controls = preview.slice(
      preview.indexOf("<View style={styles.arrowStack}>") ,
      preview.indexOf("</View>", preview.indexOf('accessibilityLabel={`Remove and replace')),
    );
    expect(controls).not.toContain("hitSlop");
    expect(preview).toMatch(/arrowStack:\s*\{[\s\S]*?gap: 2,/u);
    expect(preview).toMatch(/iconButton:\s*\{[\s\S]*?height: 48,[\s\S]*?width: 48,/u);
    expect(preview).toMatch(/trashButton:\s*\{[\s\S]*?height: 48,[\s\S]*?width: 48,/u);
    expect(preview).toContain("reorderTrackInGeneratedSceneEditor(preview, signal.track.id, \"up\")");
    expect(preview).toContain("reorderTrackInGeneratedSceneEditor(preview, signal.track.id, \"down\")");
  });

  it("records playback feedback only from explicit controls, never ordinary completion", () => {
    const nowPlaying = read("app/now-playing.tsx");
    const move = nowPlaying.slice(
      nowPlaying.indexOf("const move ="),
      nowPlaying.indexOf("const finish ="),
    );
    const finish = nowPlaying.slice(
      nowPlaying.indexOf("const finish ="),
      nowPlaying.indexOf("const recoverStorage ="),
    );
    expect(move).toContain('direction === 1 ? "skip" : "replay"');
    expect(move).toContain("operationSession.trackElapsedSeconds > 3");
    expect(finish).not.toContain('action: "replay"');
    expect(finish).not.toContain('action: "skip"');
    expect(finish).not.toContain("enqueueStoredSceneRecommendationFeedback");
    expect(nowPlaying).toContain("recordListeningHistory");
    expect(nowPlaying).toContain("recordScenePlay");
  });

  it("does not infer a track skip when the questionnaire itself is skipped", () => {
    const feedback = read("app/scene-feedback.tsx");
    expect(feedback).toContain('accessibilityLabel="Skip feedback"');
    expect(feedback).toContain('onPress={() => router.replace("/(tabs)")}');
    expect(feedback).not.toContain('action: "skip"');
    expect(feedback).not.toContain("recordStoredSceneRecommendationFeedback");
  });
});
