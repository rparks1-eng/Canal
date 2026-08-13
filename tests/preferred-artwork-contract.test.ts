import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (relativePath: string) =>
  readFileSync(path.join(root, relativePath), "utf8");

describe("app-wide preferred artwork contract", () => {
  it("resolves Apple Music before Spotify and uses Genius only as the final fallback", () => {
    const artwork = read("lib/spotify-scene-artwork.ts");
    const helper = artwork.slice(
      artwork.indexOf("async function loadPreferredArtwork"),
      artwork.indexOf("function loadCachedSpotifyArtworkUrl"),
    );

    expect(helper.indexOf("loadAppleMusicCatalogArtwork")).toBeGreaterThan(-1);
    expect(helper.indexOf("loadCachedSpotifyArtworkUrl")).toBeGreaterThan(
      helper.indexOf("loadAppleMusicCatalogArtwork"),
    );
    expect(helper.indexOf("readCachedGeniusArtwork")).toBeGreaterThan(
      helper.indexOf("loadCachedSpotifyArtworkUrl"),
    );
  });

  it("applies the preferred resolver to orbit, generated, stored, Snapshot, and Stage surfaces", () => {
    const artwork = read("lib/spotify-scene-artwork.ts");
    expect(artwork).toContain("addSpotifyArtworkToTracks");
    expect(artwork).toContain("addSpotifyArtworkToGeneratedScene");
    expect(artwork).toContain("addSpotifyArtworkToStoredScene");
    expect(artwork).toContain("addSpotifyArtworkToSnapshot");
    expect(artwork).toContain("addSpotifyArtworkToLiveStage");
    expect(artwork.match(/loadPreferredArtwork\(/gu)?.length).toBeGreaterThanOrEqual(4);
    expect(artwork.match(/loadAppleMusicCatalogArtwork\(/gu)?.length).toBeGreaterThanOrEqual(3);
  });

  it("uses Apple artwork when both provider libraries contain the same song", () => {
    const combined = read("lib/combined-music-library.ts");
    expect(combined).toContain("applyAppleArtwork");
    expect(combined.indexOf("applyAppleArtwork(duplicateId")).toBeGreaterThan(-1);
  });

  it("replaces legacy image arrays so consumers cannot render stale Spotify art", () => {
    const artwork = read("lib/spotify-scene-artwork.ts");
    const helper = artwork.slice(
      artwork.indexOf("function trackWithArtwork"),
      artwork.indexOf("function isGeniusArtworkUrl"),
    );

    expect(helper).toContain("imageUrl");
    expect(helper).toContain("images: [{ url: imageUrl }]");
  });

  it("allows Apple to replace existing provider artwork in public and playback views", () => {
    const publicScene = read("app/public-scene.tsx");
    const nowPlaying = read("app/now-playing.tsx");

    expect(publicScene).toContain("if (publicScene.scene.tracks.length > 0)");
    expect(publicScene).not.toContain("publicScene.scene.tracks.some((track) => !track.imageUrl)");
    expect(nowPlaying).toContain("scene.tracks.length === 0");
    expect(nowPlaying).not.toContain("scene.tracks.every(");
  });

  it("personalizes Explore with the combined Apple Music and Spotify library", () => {
    const explore = read("app/(tabs)/explore.tsx");

    expect(explore).toContain("readCombinedSceneMusicLibrary");
    expect(explore).toContain("tasteResult.value?.snapshot ?? null");
    expect(explore).not.toContain("readSpotifyLibrarySnapshot");
  });

  it("uses multi-provider genre evidence when learning from orbit feedback", () => {
    const home = read("app/(tabs)/index.tsx");

    expect(home).toContain("readProviderSongMetadata");
    expect(home).toContain("providerMetadata.genreEvidence");
  });
});
