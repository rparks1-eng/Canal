import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "app/scene-snapshot.tsx"),
  "utf8",
);

describe("Scene Snapshot artwork recovery", () => {
  it("enriches stored Scenes and Stage fallbacks before rendering the editor", () => {
    expect(source).toContain("addSpotifyArtworkToStoredScene");
    expect(source).toMatch(
      /const artworkReadyScene = sceneWithRouteArtwork[\s\S]*await addSpotifyArtworkToStoredScene\(sceneWithRouteArtwork\)/u,
    );
    expect(source).toMatch(
      /stageScene[\s\S]*await addSpotifyArtworkToStoredScene\(stageScene\)/u,
    );
  });

  it("preserves route-provided artwork before fallback enrichment", () => {
    expect(source).toMatch(
      /track\.id === params\.trackId && !track\.imageUrl && routeTrackImageUrl[\s\S]*imageUrl: routeTrackImageUrl/u,
    );
    expect(source).toContain("source={{ uri: selectedTrack.imageUrl }}");
    expect(source).toContain("source={{ uri: track.imageUrl }}");
  });
});
