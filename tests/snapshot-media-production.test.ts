import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("finished Snapshot media production", () => {
  it("exports the rendered photo composition and a native overlaid video", () => {
    const production = read("lib/snapshot-media-production.ts");
    const native = read("modules/snapshot-composer/ios/SnapshotComposerModule.swift");
    expect(production).toContain("captureRef(input.compositionRef");
    expect(production).toContain("captureRef(input.overlayRef");
    expect(production).toContain("composeSnapshotVideo(localSource.uri");
    expect(production).toContain("Sharing.shareAsync(result.uri");
    expect(native).toContain("CMTime(seconds: 10");
    expect(native).toContain("AVVideoCompositionCoreAnimationTool");
    expect(native).toContain("overlayLayer.contents = overlayImage");
    expect(native).toContain("exporter.outputFileType = .mp4");
  });

  it("uses one canonical composition in the editor, Explore, detail, and share paths", () => {
    const editor = read("app/scene-snapshot.tsx");
    const detail = read("app/snapshots/[snapshotId].tsx");
    const feed = read("components/PublicSnapshotCard.tsx");
    const composition = read("components/snapshot-composition.tsx");
    expect(editor).toContain("<SnapshotComposition");
    expect(editor).toContain("shareFinishedSnapshot");
    expect(detail).toContain("shareFinishedSnapshot");
    expect(detail).toContain("overlayRef={overlayRef}");
    expect(feed).toContain("<SnapshotComposition");
    expect(composition).toContain("ref={overlayRef}");
    expect(composition).toContain("SnapshotMediaPreview");
  });

  it("presents the canonical link after exporting finished media", () => {
    const production = read("lib/snapshot-media-production.ts");
    const detail = read("app/snapshots/[snapshotId].tsx");
    expect(production).toContain("presentSnapshotCanonicalLink(input.canonicalUrl");
    expect(production).toContain("Expo Sharing exports the finished local file");
    expect(detail).toContain("getOrCreatePublicSnapshotShareId(snapshot.id)");
    expect(detail).toContain("canalCanonicalUrl(`/snapshots/${encodeURIComponent(publicShareId)}`)");
    expect(detail).toContain('snapshot.visibility === "public"');
  });

  it("owns durable drafts, retryable cloud writes, and exact cleanup", () => {
    const camera = read("app/snapshot-camera.tsx");
    const production = read("lib/snapshot-media-production.ts");
    const editor = read("app/scene-snapshot.tsx");
    expect(camera).toContain("persistSnapshotCaptureDraft");
    expect(camera).toContain("toggleRecordingAsync()");
    expect(camera).toContain("recordAsync({ maxDuration: 10 })");
    expect(production).toContain("canal-snapshot-drafts");
    expect(production).toContain("reapExpiredSnapshotMediaDrafts");
    expect(production).toContain("isSnapshotMediaDraftOwnedByScope");
    expect(production).toContain("!filePath.slice(parentPath.length + 1).includes");
    expect(camera).toContain("reapExpiredSnapshotMediaDrafts()");
    expect(editor).toContain("isSnapshotMediaDraftOwnedByScope(requestedMediaUri, draftScope)");
    expect(production).toContain("ownedBy(directory");
    expect(production).toContain("finally");
    expect(editor).toContain("syncSnapshotWithStatus");
    expect(editor).toContain("cleanupSnapshotMediaDraft(mediaUri");
  });
});
