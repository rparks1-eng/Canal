import {
  getMusicLibraryTrackSuggestions,
} from "../lib/music-library-suggestions";

import type {
  MusicCatalogTrack,
  MusicLibrarySnapshot,
  MusicProviderId,
} from "../lib/music-provider-model";

function track(
  providerId:
    MusicProviderId,
  itemId: string,
  name: string,
  artist: string,
): MusicCatalogTrack {
  return {
    reference: {
      providerId,
      itemId,
    },
    name,
    durationMs:
      180_000,
    explicit:
      false,
    artists: [
      {
        name:
          artist,
      },
    ],
  };
}

function snapshot(
  overrides: Partial<
    MusicLibrarySnapshot
  > = {},
): MusicLibrarySnapshot {
  return {
    providerId:
      "spotify",
    syncedAt:
      "2026-07-28T12:00:00.000Z",
    account: {
      accountId:
        "account-a",
      displayName:
        "Listener A",
    },
    topArtists: [],
    topTracks: [],
    recentTracks: [],
    savedTracks: [],
    playlistTracks: [],
    discoveryTracks: [],
    playlists: [],
    topGenres: [],
    trackGenres: {},
    warnings: [],
    ...overrides,
  };
}

describe(
  "provider-neutral library suggestions",
  () => {
    it(
      "ranks recent matches first and deduplicates within one provider",
      () => {
        const top =
          track(
            "spotify",
            "shared-track",
            "Focus Song",
            "Canal Artist",
          );
        const recent = {
          ...top,
          name:
            "Focus Song (recent)",
        };

        const result =
          getMusicLibraryTrackSuggestions(
            snapshot({
              topTracks: [
                top,
              ],
              recentTracks: [
                recent,
              ],
            }),
            "focus",
          );

        expect(
          result,
        ).toEqual([
          recent,
        ]);
      },
    );

    it(
      "keeps equal item IDs from different providers distinct",
      () => {
        const result =
          getMusicLibraryTrackSuggestions(
            snapshot({
              recentTracks: [
                track(
                  "spotify",
                  "track-a",
                  "Shared Song",
                  "Artist A",
                ),
              ],
              topTracks: [
                track(
                  "apple-music",
                  "track-a",
                  "Shared Song",
                  "Artist B",
                ),
              ],
            }),
            "shared",
          );

        expect(
          result.map(
            (item) =>
              item.reference
                .providerId,
          ),
        ).toEqual([
          "spotify",
          "apple-music",
        ]);
      },
    );

    it(
      "matches artist names and applies a bounded limit",
      () => {
        const result =
          getMusicLibraryTrackSuggestions(
            snapshot({
              savedTracks: [
                track(
                  "spotify",
                  "track-a",
                  "First",
                  "Canal Artist",
                ),
                track(
                  "spotify",
                  "track-b",
                  "Second",
                  "Canal Artist",
                ),
              ],
            }),
            "canal",
            0,
          );

        expect(
          result,
        ).toHaveLength(
          1,
        );
        expect(
          getMusicLibraryTrackSuggestions(
            null,
            "canal",
          ),
        ).toEqual([]);
        expect(
          getMusicLibraryTrackSuggestions(
            snapshot(),
            "   ",
          ),
        ).toEqual([]);
      },
    );
  },
);
