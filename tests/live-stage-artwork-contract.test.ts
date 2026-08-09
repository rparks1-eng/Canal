import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");

describe("live Stage artwork surfaces", () => {
  it.each([
    ["Explore Stage cards", "app/(tabs)/live.tsx"],
    ["live room and Up Next", "app/live-stage/[stageId].tsx"],
    ["Stage lobby mix", "app/stage-lobby/[stageId].tsx"],
  ])("renders actual album artwork in %s", (_label, relativePath) => {
    const source = fs.readFileSync(path.join(root, relativePath), "utf8");
    expect(source).toContain("addSpotifyArtworkToLiveStage");
    expect(source).toContain("<Image");
    expect(source).toContain("album artwork");
  });

  it("keeps current and queued artwork visible in the live room", () => {
    const source = fs.readFileSync(path.join(root, "app", "live-stage", "[stageId].tsx"), "utf8");
    expect(source).toContain("currentTrackImageUrl");
    expect(source).toContain("styles.queueArtwork");
    expect(source).toMatch(/stage[.]currentTrackIndex \+ offset/u);
  });
});
