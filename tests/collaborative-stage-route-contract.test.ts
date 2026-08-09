import fs from "node:fs";
import path from "node:path";

function source(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("collaborative Stage route contract", () => {
  const createStage = source("app/create-stage.tsx");
  const joinStage = source("app/join-stage.tsx");
  const contribution = source("app/stage-contribution.tsx");
  const invitations = source("app/stage-invite-collaborators.tsx");
  const lobby = source("app/stage-lobby/[stageId].tsx");
  const studio = source("app/scene-studio.tsx");
  const preview = source("app/scene-preview.tsx");
  const home = source("app/(tabs)/index.tsx");

  it("routes hosts and joined collaborators through the contribution lobby", () => {
    expect(createStage).toContain("submitSceneToStage");
    expect(createStage).toContain('"/stage-invite-collaborators"');
    expect(joinStage).toContain('"/stage-contribution"');
    expect(joinStage).toContain('"/live-stage/[stageId]"');
    expect(invitations).toContain("inviteStageCollaborators");
    expect(invitations).toContain('pathname:\n        "/stage-lobby/[stageId]"');
    expect(contribution).toContain("submitSceneToStage(stageId, selected");
    expect(contribution).toContain('pathname: "/stage-lobby/[stageId]"');
  });

  it("returns a freshly saved Scene to the same Stage contribution", () => {
    expect(contribution).toContain('pathname: "/scene-studio"');
    expect(contribution).toContain("params: { stageId");
    expect(studio).toContain("params.stageId");
    expect(studio).toMatch(/pathname:\s*"\/scene-preview"/u);
    expect(preview).toContain('pathname: "/stage-contribution"');
    expect(preview).toContain("params: { stageId, sceneId: savedScene.id }");
  });

  it("keeps realtime lobby refresh and host-only mix controls wired", () => {
    expect(lobby).toContain("subscribeToLiveStage(stageId");
    expect(lobby).toContain("readStageContributionStatuses(stageId)");
    expect(lobby).toContain("const isHost = stage?.hostId === user?.id");
    expect(lobby).toContain("buildCollaborativeStageMix(stageId)");
    expect(lobby).toContain("Generate balanced mix");
  });

  it("exposes Stage creation and code joining from Home", () => {
    expect(home).toContain('accessibilityLabel="Start a collaborative Stage"');
    expect(home).toContain('router.push("/create-stage")');
    expect(home).toContain('accessibilityLabel="Join a Stage with a code"');
    expect(home).toContain('router.push("/join-stage")');
  });

  it("does not claim to upload raw Spotify history", () => {
    expect(contribution).toContain("Raw history is never shown to collaborators.");
    expect(contribution).not.toMatch(/savedTracks|recentTracks|topTracks|playlistTracks/u);
  });
});
