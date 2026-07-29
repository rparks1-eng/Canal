import type {
  MusicCatalogTrack,
  MusicLibrarySnapshot,
} from "./music-provider-model";

export function getMusicLibraryTrackSuggestions(
  snapshot:
    | MusicLibrarySnapshot
    | null,
  query: string,
  limit = 10,
): MusicCatalogTrack[] {
  const normalized =
    query
      .trim()
      .toLowerCase();

  if (
    !snapshot ||
    !normalized
  ) {
    return [];
  }

  const candidates =
    new Map<
      string,
      {
        track:
          MusicCatalogTrack;
        score: number;
      }
    >();

  const addTracks = (
    tracks:
      readonly MusicCatalogTrack[],
    sourceScore: number,
  ): void => {
    tracks.forEach(
      (
        track,
        index,
      ) => {
        const title =
          track.name.toLowerCase();
        const artists =
          track.artists
            .map(
              (artist) =>
                artist.name.toLowerCase(),
            )
            .join(" ");

        if (
          !title.includes(
            normalized,
          ) &&
          !artists.includes(
            normalized,
          )
        ) {
          return;
        }

        const score =
          sourceScore -
          index +
          (
            title.startsWith(
              normalized,
            )
              ? 50
              : 0
          ) +
          (
            track.artists.some(
              (artist) =>
                artist.name
                  .toLowerCase()
                  .startsWith(
                    normalized,
                  ),
            )
              ? 40
              : 0
          );
        const key =
          `${track.reference.providerId}:${track.reference.itemId}`;
        const existing =
          candidates.get(
            key,
          );

        if (
          !existing ||
          score >
            existing.score
        ) {
          candidates.set(
            key,
            {
              track,
              score,
            },
          );
        }
      },
    );
  };

  addTracks(
    snapshot.recentTracks,
    300,
  );
  addTracks(
    snapshot.topTracks,
    240,
  );
  addTracks(
    snapshot.savedTracks,
    180,
  );
  addTracks(
    snapshot.playlistTracks,
    210,
  );
  addTracks(
    snapshot.discoveryTracks,
    100,
  );

  const safeLimit =
    Math.min(
      Math.max(
        Math.trunc(
          limit,
        ),
        1,
      ),
      25,
    );

  return Array.from(
    candidates.values(),
  )
    .sort(
      (
        first,
        second,
      ) =>
        second.score -
        first.score,
    )
    .slice(
      0,
      safeLimit,
    )
    .map(
      ({ track }) =>
        track,
    );
}
