import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  saveLocalProfile,
} from "../lib/canal-session";
import {
  createLiveStage,
  getLiveStageTrackImageUrl,
  getLiveStageTrackSpotifyUrl,
  normalizeLiveStageMessageRows,
  normalizeLiveStageRows,
  readLiveStageMessages,
  readLiveStages,
  sendLiveStageMessage,
  writeLiveStages,
} from "../lib/live-stages";
import type {
  LiveStageMemberRow,
  LiveStageMessageRow,
  LiveStageRow,
} from "../lib/live-stages";
import {
  mockStorage,
} from "./helpers/async-storage-mock";

const VALID_SPOTIFY_TRACK_ID =
  "4uLU6hMCjMI75M1A2tKUQC";

const OTHER_SPOTIFY_TRACK_ID =
  "0VjIjW4GlUZAMYd2vXMi3b";

const VALID_SPOTIFY_IMAGE_TOKEN =
  "ab67616d0000b273d6f4a718b4b61e40";

jest.mock(
  "../lib/supabase",
  () => ({
    isSupabaseConfigured:
      false,
    requireSupabaseConfiguration:
      jest.fn(),
    supabase: {},
  }),
);

function stageRow(
  overrides:
    Partial<LiveStageRow> =
      {},
): LiveStageRow {
  return {
    id:
      "00000000-0000-4000-8000-000000000001",
    host_id:
      "user-host",
    host_display_name:
      "Maya Thompson",
    host_handle:
      "maya.wav",
    stage_kind:
      "community",
    host_is_verified:
      false,
    host_is_canal:
      false,
    scene_id:
      "scene-1",
    stage_code:
      "248319",
    name:
      "Friday Night Drive",
    activity:
      "Driving through the city",
    visibility:
      "public",
    status:
      "live",
    tracks: [
      {
        id:
          "track-1",
        title:
          "Signal",
        artist:
          "Canal Artist",
        source:
          "Spotify",
        durationMs:
          210000,
        imageUrl:
          `https://i.scdn.co/image/${VALID_SPOTIFY_IMAGE_TOKEN}`,
      },
    ],
    current_track_index:
      4,
    created_at:
      "2026-07-28T18:00:00.000Z",
    updated_at:
      "2026-07-28T19:00:00.000Z",
    ended_at:
      null,
    ...overrides,
  };
}

function memberRow(
  overrides:
    Partial<LiveStageMemberRow> =
      {},
): LiveStageMemberRow {
  return {
    stage_id:
      "00000000-0000-4000-8000-000000000001",
    user_id:
      "user-host",
    display_name:
      "Maya Thompson",
    handle:
      "maya.wav",
    role:
      "host",
    avatar_url:
      "https://example.com/maya.jpg",
    joined_at:
      "2026-07-28T18:00:00.000Z",
    ...overrides,
  };
}

function messageRow(
  overrides:
    Partial<LiveStageMessageRow> =
      {},
): LiveStageMessageRow {
  return {
    id:
      "message-1",
    stage_id:
      "00000000-0000-4000-8000-000000000001",
    user_id:
      "user-listener",
    display_name:
      "Nico Alvarez",
    handle:
      "nico.fm",
    body:
      "  This transition is perfect.  ",
    created_at:
      "2026-07-28T19:02:00.000Z",
    avatar_url:
      "https://example.com/nico.jpg",
    ...overrides,
  };
}

async function useLocalProfile(
  handle: string,
  displayName: string,
): Promise<void> {
  const now =
    "2026-07-28T20:00:00.000Z";

  await saveLocalProfile({
    handle,
    displayName,
    bio: "",
    favoriteActivities:
      "",
    createdAt:
      now,
    updatedAt:
      now,
  });
}

describe(
  "live Stage normalization",
  () => {
    it(
      "combines Stage, queue, membership, and participant rows",
      () => {
        const stages =
          normalizeLiveStageRows(
            [
              stageRow(),
            ],
            [
              memberRow(),
              memberRow({
                user_id:
                  "user-listener",
                display_name:
                  "Nico Alvarez",
                handle:
                  "nico.fm",
                role:
                  "listener",
                joined_at:
                  "2026-07-28T18:01:00.000Z",
              }),
            ],
            "user-listener",
          );

        expect(
          stages,
        ).toHaveLength(
          1,
        );

        expect(
          stages[0],
        ).toMatchObject({
          code:
            "248319",
          hostUsername:
            "maya.wav",
          hostAvatarUrl:
            "https://example.com/maya.jpg",
          stageKind:
            "community",
          hostIsVerified:
            false,
          hostIsCanal:
            false,
          sceneId:
            "scene-1",
          participantCount:
            2,
          listenerCount:
            1,
          membershipRole:
            "listener",
          currentTrackIndex:
            0,
        });

        expect(stages[0]?.participants[0]?.avatarUrl).toBe(
          "https://example.com/maya.jpg",
        );

        expect(
          stages[0]
            .participants.map(
              (participant) =>
                participant.role,
            ),
        ).toEqual([
          "host",
          "listener",
        ]);

        expect(
          stages[0]
            .tracks[0],
        ).toMatchObject({
          title:
            "Signal",
          durationMs:
            210000,
          imageUrl:
            `https://i.scdn.co/image/${VALID_SPOTIFY_IMAGE_TOKEN}`,
        });
      },
    );

    it(
      "sorts the most recently updated Stage first",
      () => {
        const stages =
          normalizeLiveStageRows(
            [
              stageRow({
                id:
                  "00000000-0000-4000-8000-000000000001",
                updated_at:
                  "2026-07-28T19:00:00.000Z",
              }),
              stageRow({
                id:
                  "00000000-0000-4000-8000-000000000002",
                updated_at:
                  "2026-07-28T20:00:00.000Z",
              }),
            ],
            [],
            null,
          );

        expect(
          stages.map(
            (stage) =>
              stage.id,
          ),
        ).toEqual([
          "00000000-0000-4000-8000-000000000002",
          "00000000-0000-4000-8000-000000000001",
        ]);
      },
    );

    it(
      "canonicalizes trusted Spotify links and safe HTTPS artwork",
      () => {
        const [
          stage,
        ] =
          normalizeLiveStageRows(
            [
              stageRow({
                tracks: [
                  {
                    id:
                      "track-uri",
                    title:
                      "URI Track",
                    artist:
                      "Canal Artist",
                    source:
                      "Spotify",
                    spotifyUri:
                      `spotify:track:${VALID_SPOTIFY_TRACK_ID}`,
                    imageUrl:
                      `HTTPS://I.SCDN.CO/image/${VALID_SPOTIFY_IMAGE_TOKEN}`,
                  },
                  {
                    id:
                      "track-url",
                    title:
                      "URL Track",
                    artist:
                      "Canal Artist",
                    source:
                      "Spotify",
                    spotifyUrl:
                      `HTTPS://OPEN.SPOTIFY.COM/track/${OTHER_SPOTIFY_TRACK_ID}`,
                  },
                ],
              }),
            ],
            [],
            null,
          );

        expect(
          stage.tracks[0],
        ).toMatchObject({
          spotifyUri:
            `spotify:track:${VALID_SPOTIFY_TRACK_ID}`,
          spotifyUrl:
            `https://open.spotify.com/track/${VALID_SPOTIFY_TRACK_ID}`,
          imageUrl:
            `https://i.scdn.co/image/${VALID_SPOTIFY_IMAGE_TOKEN}`,
        });

        expect(
          stage.tracks[1],
        ).toMatchObject({
          spotifyUri:
            `spotify:track:${OTHER_SPOTIFY_TRACK_ID}`,
          spotifyUrl:
            `https://open.spotify.com/track/${OTHER_SPOTIFY_TRACK_ID}`,
        });

        expect(
          getLiveStageTrackSpotifyUrl(
            stage.tracks[0],
          ),
        ).toBe(
          `https://open.spotify.com/track/${VALID_SPOTIFY_TRACK_ID}`,
        );

        expect(
          getLiveStageTrackImageUrl(
            stage.tracks[0],
          ),
        ).toBe(
          `https://i.scdn.co/image/${VALID_SPOTIFY_IMAGE_TOKEN}`,
        );
      },
    );

    it.each([
      [
        "custom scheme",
        "javascript:alert(1)",
      ],
      [
        "lookalike host",
        `https://open.spotify.com.evil.example/track/${VALID_SPOTIFY_TRACK_ID}`,
      ],
      [
        "embedded credentials",
        `https://listener@open.spotify.com/track/${VALID_SPOTIFY_TRACK_ID}`,
      ],
      [
        "unexpected query",
        `https://open.spotify.com/track/${VALID_SPOTIFY_TRACK_ID}?si=tracking`,
      ],
      [
        "unexpected fragment",
        `https://open.spotify.com/track/${VALID_SPOTIFY_TRACK_ID}#player`,
      ],
      [
        "locale-prefixed path",
        `https://open.spotify.com/intl-fr/track/${VALID_SPOTIFY_TRACK_ID}`,
      ],
      [
        "non-base62 identifier",
        "https://open.spotify.com/track/not_a_spotify_id",
      ],
    ])(
      "drops a %s instead of exposing it as a Spotify link",
      (
        _caseName,
        spotifyUrl,
      ) => {
        const [
          stage,
        ] =
          normalizeLiveStageRows(
            [
              stageRow({
                tracks: [
                  {
                    id:
                      "unsafe-track",
                    title:
                      "Unsafe Track",
                    artist:
                      "Canal Artist",
                    source:
                      "Spotify",
                    spotifyUrl,
                  },
                ],
              }),
            ],
            [],
            null,
          );

        expect(
          stage.tracks[0],
        ).not.toHaveProperty(
          "spotifyUri",
        );
        expect(
          stage.tracks[0],
        ).not.toHaveProperty(
          "spotifyUrl",
        );
        expect(
          getLiveStageTrackSpotifyUrl(
            stage.tracks[0],
          ),
        ).toBeNull();
      },
    );

    it.each([
      [
        "custom scheme",
        "data:image/png;base64,AAAA",
      ],
      [
        "insecure transport",
        `http://i.scdn.co/image/${VALID_SPOTIFY_IMAGE_TOKEN}`,
      ],
      [
        "embedded credentials",
        `https://listener@i.scdn.co/image/${VALID_SPOTIFY_IMAGE_TOKEN}`,
      ],
      [
        "unexpected query",
        `https://i.scdn.co/image/${VALID_SPOTIFY_IMAGE_TOKEN}?width=400`,
      ],
      [
        "unexpected fragment",
        `https://i.scdn.co/image/${VALID_SPOTIFY_IMAGE_TOKEN}#artwork`,
      ],
      [
        "unexpected CDN path",
        `https://i.scdn.co/art/${VALID_SPOTIFY_IMAGE_TOKEN}`,
      ],
      [
        "arbitrary image host",
        `https://images.example.com/image/${VALID_SPOTIFY_IMAGE_TOKEN}`,
      ],
      [
        "lookalike CDN host",
        `https://i.scdn.co.evil.example/image/${VALID_SPOTIFY_IMAGE_TOKEN}`,
      ],
    ])(
      "drops %s artwork",
      (
        _caseName,
        imageUrl,
      ) => {
        expect(
          getLiveStageTrackImageUrl({
            id:
              "image-track",
            title:
              "Image Track",
            artist:
              "Canal Artist",
            source:
              "Spotify",
            imageUrl,
          }),
        ).toBeNull();
      },
    );

    it(
      "drops mismatched Spotify identities, unsafe artwork, and oversize track fields",
      () => {
        const tracks =
          normalizeLiveStageRows(
            [
              stageRow({
                tracks: [
                  {
                    id:
                      "mismatch",
                    title:
                      "Mismatched",
                    artist:
                      "Canal Artist",
                    source:
                      "Spotify",
                    spotifyUri:
                      `spotify:track:${VALID_SPOTIFY_TRACK_ID}`,
                    spotifyUrl:
                      `https://open.spotify.com/track/${OTHER_SPOTIFY_TRACK_ID}`,
                    imageUrl:
                      "https://127.0.0.1/private.jpg",
                  },
                  {
                    id:
                      "界".repeat(
                        100,
                      ),
                    title:
                      "Bounded",
                    artist:
                      "Canal Artist",
                    source:
                      "S".repeat(
                        41,
                      ),
                    durationMs:
                      86_400_001,
                    imageUrl:
                      `https://images.example.com/${"x".repeat(
                        1100,
                      )}`,
                  },
                  {
                    id:
                      "too-long-title",
                    title:
                      "T".repeat(
                        201,
                      ),
                    artist:
                      "Canal Artist",
                    source:
                      "Canal",
                  },
                  {
                    id:
                      "bad-uri",
                    title:
                      "Custom URI",
                    artist:
                      "Canal Artist",
                    source:
                      "Spotify",
                    spotifyUri:
                      `spotify:episode:${VALID_SPOTIFY_TRACK_ID}`,
                    imageUrl:
                      "data:image/png;base64,AAAA",
                  },
                ],
              }),
            ],
            [],
            null,
          )[0].tracks;

        expect(
          tracks,
        ).toHaveLength(
          3,
        );
        expect(
          tracks[0],
        ).not.toHaveProperty(
          "spotifyUrl",
        );
        expect(
          tracks[0],
        ).not.toHaveProperty(
          "imageUrl",
        );
        expect(
          tracks[1],
        ).toMatchObject({
          id:
            "stage-track-1",
          source:
            "Canal",
        });
        expect(
          tracks[1],
        ).not.toHaveProperty(
          "durationMs",
        );
        expect(
          tracks[1],
        ).not.toHaveProperty(
          "imageUrl",
        );
        expect(
          tracks[2],
        ).not.toHaveProperty(
          "spotifyUri",
        );
        expect(
          tracks[2],
        ).not.toHaveProperty(
          "imageUrl",
        );
      },
    );

    it(
      "bounds the normalized Stage queue before processing untrusted entries",
      () => {
        const tracks =
          normalizeLiveStageRows(
            [
              stageRow({
                tracks:
                  Array.from(
                    {
                      length:
                        105,
                    },
                    (
                      _value,
                      index,
                    ) => ({
                      id:
                        `track-${index}`,
                      title:
                        `Track ${index}`,
                      artist:
                        "Canal Artist",
                      source:
                        "Canal",
                    }),
                  ),
              }),
            ],
            [],
            null,
          )[0].tracks;

        expect(
          tracks,
        ).toHaveLength(
          100,
        );
        expect(
          tracks.at(
            -1,
          )?.id,
        ).toBe(
          "track-99",
        );
      },
    );

    it(
      "normalizes trusted Stage provenance and safely defaults legacy values",
      () => {
        const stages =
          normalizeLiveStageRows(
            [
              stageRow({
                id:
                  "00000000-0000-4000-8000-000000000001",
                stage_kind:
                  "verified",
                host_is_verified:
                  true,
              }),
              stageRow({
                id:
                  "00000000-0000-4000-8000-000000000002",
                stage_kind:
                  "unexpected",
                host_is_verified:
                  false,
                host_is_canal:
                  false,
              }),
              stageRow({
                id:
                  "00000000-0000-4000-8000-000000000003",
                stage_kind:
                  undefined as unknown as
                    string,
                host_is_verified:
                  undefined as unknown as
                    boolean,
                host_is_canal:
                  undefined as unknown as
                    boolean,
              }),
            ],
            [],
            null,
          );

        expect(
          stages[0],
        ).toMatchObject({
          stageKind:
            "verified",
          hostIsVerified:
            true,
          hostIsCanal:
            false,
        });

        expect(
          stages[1],
        ).toMatchObject({
          stageKind:
            "community",
          hostIsVerified:
            false,
          hostIsCanal:
            false,
        });

        expect(
          stages[2],
        ).toMatchObject({
          stageKind:
            "community",
          hostIsVerified:
            false,
          hostIsCanal:
            false,
        });

        const canalStage =
          normalizeLiveStageRows(
            [
              stageRow({
                stage_kind:
                  "canal",
                host_is_verified:
                  true,
                host_is_canal:
                  true,
              }),
            ],
            [],
            null,
          )[0];

        expect(
          canalStage,
        ).toMatchObject({
          stageKind:
            "canal",
          hostIsVerified:
            true,
          hostIsCanal:
            true,
        });
      },
    );
  },
);

describe(
  "live Stage chat normalization",
  () => {
    it(
      "orders chat chronologically and marks the current user's messages",
      () => {
        const messages =
          normalizeLiveStageMessageRows(
            [
              messageRow(),
              messageRow({
                id:
                  "message-0",
                user_id:
                  "user-host",
                body:
                  "Welcome in",
                created_at:
                  "2026-07-28T19:01:00.000Z",
              }),
              messageRow({
                id:
                  "invalid",
                body:
                  "   ",
              }),
            ],
            "user-listener",
          );

        expect(
          messages.map(
            (message) =>
              message.id,
          ),
        ).toEqual([
          "message-0",
          "message-1",
        ]);

        expect(
          messages[1],
        ).toMatchObject({
          body:
            "This transition is perfect.",
          username:
            "nico.fm",
          initials:
            "NA",
          avatarUrl:
            "https://example.com/nico.jpg",
          isMine:
            true,
        });
      },
    );
  },
);

describe(
  "local live Stage ownership and mutation safety",
  () => {
    beforeEach(() => {
      mockStorage.clear();
      jest.clearAllMocks();
    });

    it(
      "isolates Stage and message stores by the current Canal profile",
      async () => {
        await useLocalProfile(
          "@alice",
          "Alice Example",
        );
        await writeLiveStages(
          [],
        );

        const aliceStage =
          await createLiveStage({
            name:
              "Alice Stage",
            hostName:
              "Spoofed Host",
            hostUsername:
              "spoofed",
          });

        await sendLiveStageMessage(
          aliceStage.id,
          "Alice only",
        );

        expect(
          aliceStage,
        ).toMatchObject({
          hostId:
            "local-profile:alice",
          hostUsername:
            "alice",
          hostName:
            "Alice Example",
          stageKind:
            "community",
          hostIsVerified:
            false,
          hostIsCanal:
            false,
        });

        await useLocalProfile(
          "@bob",
          "Bob Example",
        );

        expect(
          (
            await readLiveStages()
          ).some(
            (stage) =>
              stage.id ===
              aliceStage.id,
          ),
        ).toBe(
          false,
        );

        await writeLiveStages(
          [],
        );

        const bobStage =
          await createLiveStage({
            name:
              "Bob Stage",
          });

        await expect(
          readLiveStageMessages(
            aliceStage.id,
          ),
        ).resolves.toEqual(
          [],
        );

        await useLocalProfile(
          "@alice",
          "Alice Example",
        );

        const aliceStages =
          await readLiveStages();

        expect(
          aliceStages.map(
            (stage) =>
              stage.id,
          ),
        ).toEqual([
          aliceStage.id,
        ]);

        await expect(
          readLiveStageMessages(
            aliceStage.id,
          ),
        ).resolves.toMatchObject([
          {
            body:
              "Alice only",
            userId:
              "local-profile:alice",
            username:
              "alice",
            isMine:
              true,
          },
        ]);

        expect(
          aliceStages.some(
            (stage) =>
              stage.id ===
              bobStage.id,
          ),
        ).toBe(
          false,
        );

        const scopedKeys =
          Array.from(
            mockStorage.keys(),
          ).filter(
            (key) =>
              key.startsWith(
                "@canal/live-stages:",
              ),
          );

        expect(
          scopedKeys,
        ).toEqual(
          expect.arrayContaining([
            expect.stringContaining(
              "local-profile%3Aalice",
            ),
            expect.stringContaining(
              "local-profile%3Abob",
            ),
          ]),
        );

        for (
          const key of
          scopedKeys
        ) {
          const value =
            mockStorage.get(
              key,
            );

          expect(
            value,
          ).toContain(
            '"ownerId":"local-profile:',
          );
        }
      },
    );

    it(
      "serializes concurrent local writes and coalesces identical in-flight mutations",
      async () => {
        await useLocalProfile(
          "@concurrent",
          "Concurrent Listener",
        );
        await writeLiveStages(
          [],
        );

        const [
          first,
          second,
        ] =
          await Promise.all([
            createLiveStage({
              name:
                "First",
            }),
            createLiveStage({
              name:
                "Second",
            }),
          ]);

        expect(
          new Set([
            first.id,
            second.id,
          ]).size,
        ).toBe(
          2,
        );

        const [
          duplicateFirst,
          duplicateSecond,
        ] =
          await Promise.all([
            createLiveStage({
              name:
                "One tap",
            }),
            createLiveStage({
              name:
                "One tap",
            }),
          ]);

        expect(
          duplicateSecond.id,
        ).toBe(
          duplicateFirst.id,
        );

        const stages =
          await readLiveStages();

        expect(
          stages,
        ).toHaveLength(
          3,
        );

        const [
          messageFirst,
          messageSecond,
        ] =
          await Promise.all([
            sendLiveStageMessage(
              first.id,
              "One message",
            ),
            sendLiveStageMessage(
              first.id,
              "One message",
            ),
          ]);

        expect(
          messageSecond.id,
        ).toBe(
          messageFirst.id,
        );

        await Promise.all([
          sendLiveStageMessage(
            first.id,
            "Different A",
          ),
          sendLiveStageMessage(
            first.id,
            "Different B",
          ),
        ]);

        const messages =
          await readLiveStageMessages(
            first.id,
          );

        expect(
          messages.map(
            (message) =>
              message.body,
          ),
        ).toEqual([
          "One message",
          "Different A",
          "Different B",
        ]);
      },
    );
  },
);
