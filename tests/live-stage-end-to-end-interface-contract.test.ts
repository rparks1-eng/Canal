import fs from "node:fs";
import path from "node:path";

describe("Live Stage end-to-end interface", () => {
  const route = fs.readFileSync(
    path.join(process.cwd(), "app/live-stage/[stageId].tsx"),
    "utf8",
  );

  it("keeps chat beside playback and connects its complete modal flow", () => {
    const nowPlayingIndex = route.indexOf("styles.nowPlayingCard");
    const chatIndex = route.indexOf('accessibilityLabel="Open Stage chat"');
    const queueIndex = route.indexOf("styles.queueSection");

    expect(nowPlayingIndex).toBeGreaterThan(0);
    expect(chatIndex).toBeGreaterThan(nowPlayingIndex);
    expect(chatIndex).toBeLessThan(queueIndex);
    expect(route).toContain("onPress={openChat}");
    expect(route).toContain('accessibilityLabel="Close Stage chat"');
    expect(route).toContain('accessibilityLabel="Message Stage chat"');
    expect(route).toContain('accessibilityLabel="Send message"');
  });

  it("wires playback, context, queue, snapshot, contribution, invitation, and profiles", () => {
    expect(route).toContain('accessibilityLabel="Play next Stage track"');
    expect(route).toContain("onPress={() => void advanceTrack()}");
    expect(route).toContain("setContextTrack({ title: currentTrack.title");
    expect(route).toContain("setContextTrack({\n                        title: track.title");
    expect(route).toContain('queueExpanded ? "Show fewer queued tracks" : "View full Stage queue"');
    expect(route).toContain("setQueueExpanded((expanded) => !expanded)");
    expect(route).toContain('pathname: "/snapshot-camera"');
    expect(route).toContain('pathname:\n                  "/stage-contribution"');
    expect(route).toContain('accessibilityLabel="Invite people to this Stage"');
    expect(route).toContain('pathname:\n                            "/creator/[userId]"');
  });

  it("wires membership, moderation, reactions, lifecycle, and ended management", () => {
    expect(route).toContain('accessibilityLabel="Join this Stage"');
    expect(route).toContain('accessibilityLabel="Leave this Stage"');
    expect(route).toContain('accessibilityLabel={isEnded ? "Stage ended" : "End this Stage"}');
    expect(route).toContain('accessibilityLabel="Manage this ended Stage"');
    expect(route).toContain('router.push("/managed-stages")');
    expect(route).toContain('accessibilityLabel="Add emoji reaction"');
    expect(route).toContain('accessibilityLabel="Edit your message"');
    expect(route).toContain('accessibilityLabel="Delete your message"');
    expect(route).toContain("confirmMemberAction(");
  });

  it("retains accessible geometry for the redesigned playback controls", () => {
    expect(route).toMatch(/currentContextButton:\s*\{[\s\S]*?height: 48,[\s\S]*?width: 48/u);
    expect(route).toMatch(/quickAction:\s*\{[\s\S]*?width: 48,[\s\S]*?height: 48/u);
    expect(route).toMatch(/nextTrackButton:\s*\{[\s\S]*?minHeight: 50/u);
    expect(route).toMatch(/queueExpandButton:\s*\{[\s\S]*?minHeight: 44/u);
  });
});
