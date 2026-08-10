import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("public preview UI contract", () => {
  it("renders bounded pre-auth states and remembers a destination only from an auth CTA", () => {
    const actions = read("components/public-preview/public-preview-actions.tsx");
    const states = read("components/public-preview/public-preview-state.tsx");
    expect(states).toContain('"loading" | "not-found" | "private" | "expired"');
    expect(actions).toContain("rememberDeferredDestination(destination)");
    expect(actions).toMatch(/if \(!remembered\) return;[\s\S]*router\.push/u);
    expect(states).not.toContain("rememberDeferredDestination");
  });

  it("keeps the opaque Stage token hidden until an explicit join and preserves its route", () => {
    const stage = read("app/stages/[stageId]/join.tsx");
    expect(stage).toContain("redeemStageInviteToken(stageId, invite)");
    expect(stage).toContain("Stage details stay private until this invitation is safely redeemed.");
    expect(stage).toContain('`/stages/${stageId}/join?invite=${encodeURIComponent(invite)}`');
    expect(stage).not.toContain("joinLiveStageByCode");
  });

  it("shows the public Snapshot preview before authentication and preserves its route", () => {
    const snapshot = read("app/snapshots/[snapshotId].tsx");
    expect(snapshot).toContain("<SnapshotUuidRoute signedIn={Boolean(user)} snapshotId={snapshotId} />");
    expect(snapshot).toContain("readSnapshotWithStatus(snapshotId)");
    expect(snapshot).toMatch(/internalSnapshot[\s\S]*SnapshotDetailContent[\s\S]*PublicSnapshotPreview/u);
    expect(snapshot).toContain("destination={`/snapshots/${snapshotId}`}");
  });

  it("resolves a signed-in internal Scene UUID before treating it as a public share UUID", () => {
    const scene = read("app/scenes/[sceneId].tsx");
    expect(scene).toContain("<SceneUuidRoute sceneId={sceneId} />");
    expect(scene).toContain("getSceneById(sceneId)");
    expect(scene).toMatch(/internalScene[\s\S]*SceneDetailContent[\s\S]*PublicScenePreview/u);
  });
});
