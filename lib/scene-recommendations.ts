import type {
  StoredScene,
} from "./scenes";

import type {
  SpotifyLibrarySnapshot,
} from "./spotify-library";

function normalizedTerms(
  value: string,
): string[] {
  return value
    .split(",")
    .map(
      (term) =>
        term.trim().toLowerCase(),
    )
    .filter(Boolean);
}

function overlapScore(
  sceneTerms: string[],
  tasteTerms: string[],
): number {
  return sceneTerms.reduce(
    (score, sceneTerm) =>
      score +
      (tasteTerms.some(
        (tasteTerm) =>
          sceneTerm.includes(
            tasteTerm,
          ) ||
          tasteTerm.includes(
            sceneTerm,
          ),
      )
        ? 1
        : 0),
    0,
  );
}

export function rankSceneRecommendations(
  scenes: StoredScene[],
  snapshot:
    | SpotifyLibrarySnapshot
    | null,
): StoredScene[] {
  const tasteGenres =
    snapshot?.topGenres.map(
      (genre) =>
        genre.name
          .trim()
          .toLowerCase(),
    ) ?? [];

  const tasteArtists =
    snapshot?.topArtists
      .map(
        (artist) =>
          artist.name
            ?.trim()
            .toLowerCase() ??
          "",
      )
      .filter(Boolean) ?? [];

  return [...scenes].sort(
    (first, second) =>
      recommendationScore(
        second,
        tasteGenres,
        tasteArtists,
      ) -
      recommendationScore(
        first,
        tasteGenres,
        tasteArtists,
      ),
  );
}

function recommendationScore(
  scene: StoredScene,
  tasteGenres: string[],
  tasteArtists: string[],
): number {
  return (
    (scene.favorite
      ? 100
      : 0) +
    (scene.playCount ?? 0) *
      5 +
    (scene.feedback
      ?.latestRating ===
    "perfect"
      ? 35
      : 0) +
    overlapScore(
      normalizedTerms(
        scene.genres,
      ),
      tasteGenres,
    ) *
      22 +
    overlapScore(
      normalizedTerms(
        scene.artists,
      ),
      tasteArtists,
    ) *
      28
  );
}
