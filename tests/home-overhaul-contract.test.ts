import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "@jest/globals";

const source = readFileSync(
  join(process.cwd(), "app/(tabs)/index.tsx"),
  "utf8",
);
const studioSource = readFileSync(
  join(process.cwd(), "app/scene-studio.tsx"),
  "utf8",
);

function compact(value: string): string {
  return value.replace(/\s+/gu, " ");
}

describe("Home overhaul contract", () => {
  it("keeps Made for now and Recent Scene cards free-standing", () => {
    const compactStyle = source.slice(
      source.indexOf("compactSceneCard:"),
      source.indexOf("sceneCard:", source.indexOf("compactSceneCard:")),
    );
    expect(compactStyle).not.toContain("borderWidth");
    expect(compactStyle).not.toContain("boxShadow");
    expect(compactStyle).not.toContain("backgroundColor: canalDynamicColors.surface");
    expect(source).toContain("...(props.compact ? null : {");
  });
  it("hydrates the home surface from the user's persisted listening state", () => {
    expect(source).toContain("useFocusEffect(load)");
    expect(compact(source)).toMatch(
      /Promise\.all\(\[ readScenes\(\), getRecentScenes\(5\), readListeningHistory\(\), getLatestSpotifyLibrarySnapshot\(\), readAppleMusicLibrarySnapshot\(\)[\s\S]*?\]\)/u,
    );
    expect(source).toContain("combineSceneMusicLibraries");
    expect(source).toContain("rankSceneRecommendations(");
    expect(source).toContain("spotifySnapshot");
    expect(source).toContain(".slice(0, 3)");
  });

  it("opens listening and Scene destinations with stable accessible controls", () => {
    expect(source).toContain('accessibilityLabel={`Continue ${history[0].sceneName}`}');
    expect(compact(source)).toMatch(
      /pathname: "\/now-playing", params: \{ sceneId: history\[0\]\.sceneId,/u,
    );

    expect(source).toContain('accessibilityLabel={`Open ${props.scene.name}`}');
    expect(compact(source)).toMatch(
      /pathname: "\/scenes\/\[sceneId\]", params: \{ sceneId: props\.scene\.id,/u,
    );

    expect(source).toContain('accessibilityLabel="Create a Scene"');
    expect(compact(source)).toMatch(
      /const openQuickScene = useCallback\(\(track\?: SpotifyTrack\) => \{[\s\S]*?pathname: "\/scene-studio", params: \{ reset: String\(Date\.now\(\)\), quickMood, direct: trackDirection \|\| undefined,/u,
    );
    expect(compact(source)).toMatch(
      /accessibilityLabel="Create a Scene"[\s\S]*?onPress=\{\(\) => openQuickScene\(\)\}/u,
    );

    expect(source).toContain('accessibilityLabel="See all Scenes"');
    expect(compact(source)).toMatch(
      /accessibilityLabel="See all Scenes"[\s\S]*?router\.push\( "\/\(tabs\)\/library", \)/u,
    );
  });

  it("keeps collaborative Stage entry points working from Home", () => {
    expect(compact(source)).toMatch(
      /accessibilityLabel="Start a collaborative Stage"[\s\S]*?router\.push\("\/create-stage"\)/u,
    );
    expect(compact(source)).toMatch(
      /accessibilityLabel="Join a Stage with a code"[\s\S]*?router\.push\("\/join-stage"\)/u,
    );
    expect(source.indexOf("CANAL LIVE")).toBeLessThan(
      source.indexOf("CONTINUE LISTENING"),
    );
  });

  it("uses real cached connected-service tracks for the orbit actions", () => {
    expect(source).toContain("...spotifySnapshot.discoveryTracks");
    expect(source).toContain("...spotifySnapshot.recentTracks");
    expect(source).toContain(".slice(0, 3)");
    expect(source).toContain('pathname: "/song-context"');
    expect(source).toContain('accessibilityLabel={`Create a Scene from ${track.name}`}');
    expect(source).toContain("openQuickScene(track)");
    expect(source).toContain("addSpotifyArtworkToTracks");
    expect(source).toContain("isUsableOrbitTrack(track)");
    expect(source).toContain("anchorTrackId: track?.id");
    expect(source).toContain('getCanalTrackProvider(track) === "spotify" ? "Spotify" : "Apple Music"');
    expect(source).toContain("getCanalTrackProviderUrl(track)");
    expect(source).toContain('accessibilityLabel={`Add ${track.name} to a Scene`}');
    expect(source).toContain('name="ellipsis-horizontal"');
    expect(source).toContain('pathname: "/add-song-to-scene"');
    expect(source).toContain('onPress={() => openOrbitContext(track)}');
    expect(source).not.toContain('name="information-circle-outline"');
  });

  it("prefills only the chosen mood and direction while still requiring activity", () => {
    expect(studioSource).toContain("quickMood?: string; direct?: string; anchorTrackId?: string");
    expect(studioSource).toContain(
      "moods: quickMoodSeed ? [quickMoodSeed] : nextDraft.moods",
    );
    expect(studioSource).toContain("notes: directSeed || nextDraft.notes");
    expect(studioSource).toContain('if (nextStep !== "moment" && !activityChosen)');
    expect(studioSource).toContain("Choose what you are doing before continuing.");
  });

  it("keeps cached music recommendations usable while recovery is available", () => {
    expect(source).toContain("getLatestSpotifyLibrarySnapshot");
    expect(source).toContain("readAppleMusicLibrarySnapshot");
    expect(source).toContain("syncCombinedSceneMusicLibrary");
    expect(source).toContain("useReconnectReload(");
    expect(source).toContain('accessibilityLabel="Reconnect Spotify"');
    expect(source).toContain("Scenes keep working from the cached library.");
    expect(compact(source)).toMatch(
      /recommendationIssue \?\.action === "reconnect-spotify"[\s\S]*?router\.push\( "\/music-services", \)/u,
    );
  });

  it("keeps activity available without duplicating Settings on Home", () => {
    expect(source).toContain("<CanalHeaderActions showSettings={false} />");
  });
});
