import type {
  LiveStage,
} from "./live-stages";

import type {
  SpotifyLibrarySnapshot,
} from "./spotify-library";

import type {
  PublicCanalScene,
} from "./social";

function terms(
  value: string,
): string[] {
  return value
    .toLowerCase()
    .split(
      /[|,•/]+/u,
    )
    .map(
      (term) =>
        term.trim(),
    )
    .filter(
      Boolean,
    );
}

function overlap(
  values: readonly string[],
  preferences: readonly string[],
): number {
  return values.reduce(
    (score, value) =>
      score +
      (
        preferences.some(
          (preference) =>
            value ===
              preference ||
            value.includes(
              preference,
            ) ||
            preference.includes(
              value,
            ),
        )
          ? 1
          : 0
      ),
    0,
  );
}

function taste(
  snapshot: SpotifyLibrarySnapshot | null,
): {
  artists: string[];
  genres: string[];
} {
  return {
    artists:
      snapshot?.topArtists
        .map(
          (artist) =>
            artist.name
              .trim()
              .toLowerCase(),
        )
        .filter(
          Boolean,
        ) ?? [],
    genres:
      snapshot?.topGenres
        .map(
          (genre) =>
            genre.name
              .trim()
              .toLowerCase(),
        )
        .filter(
          Boolean,
        ) ?? [],
  };
}

export function rankExploreScenes(
  scenes: readonly PublicCanalScene[],
  snapshot: SpotifyLibrarySnapshot | null,
): PublicCanalScene[] {
  const preferences =
    taste(
      snapshot,
    );

  return [
    ...scenes,
  ].sort(
    (left, right) => {
      const score =
        (
          item: PublicCanalScene,
        ): number =>
          overlap(
            terms(
              item.scene.genres,
            ),
            preferences.genres,
          ) *
            28 +
          overlap(
            terms(
              item.scene.artists,
            ),
            preferences.artists,
          ) *
            34 +
          Math.log2(
            (
              item.scene.playCount ??
              0
            ) +
              2,
          ) *
            12 +
          (
            item.creator.isVerified ||
            item.creator.isCanal
              ? 16
              : 0
          );

      return (
        score(
          right,
        ) -
          score(
            left,
          ) ||
        right.updatedAt.localeCompare(
          left.updatedAt,
        )
      );
    },
  );
}

export function rankExploreStages(
  stages: readonly LiveStage[],
  snapshot: SpotifyLibrarySnapshot | null,
): LiveStage[] {
  const preferences =
    taste(
      snapshot,
    );

  return [
    ...stages,
  ]
    .filter(
      (stage) =>
        stage.status ===
          "live" &&
        stage.visibility ===
          "public",
    )
    .sort(
      (left, right) => {
        const score =
          (
            stage: LiveStage,
          ): number =>
            overlap(
              stage.tracks.flatMap(
                (track) =>
                  terms(
                    track.artist,
                  ),
              ),
              preferences.artists,
            ) *
              38 +
            overlap(
              terms(
                `${stage.name},${stage.activity},${(
                  stage.atmosphereSignals ??
                  []
                ).join(",")}`,
              ),
              preferences.genres,
            ) *
              24 +
            Math.log2(
              stage.listenerCount +
                2,
            ) *
              22 +
            Math.log2(
              stage.participantCount +
                2,
            ) *
              8;

        return (
          score(
            right,
          ) -
          score(
            left,
          )
        );
      },
    );
}
