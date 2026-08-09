import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  loadPublicSnapshotFeed,
  normalizePublicSnapshotRows,
} from "../lib/public-snapshots";

import type {
  PublicSnapshotCreator,
  PublicSnapshotRow,
} from "../lib/public-snapshots";

import {
  supabase,
} from "../lib/supabase";

jest.mock(
  "../lib/supabase",
  () => ({
    requireSupabaseConfiguration:
      jest.fn(),
    supabase: {
      auth: {
        getUser:
          jest.fn(),
      },
      from:
        jest.fn(),
      storage: {
        from: jest.fn(),
      },
    },
  }),
);

const mockGetUser =
  jest.mocked(
    supabase.auth.getUser,
  );

const mockFrom =
  jest.mocked(
    supabase.from,
  );

const mockStorageFrom = jest.mocked(supabase.storage.from);

function snapshotRow(
  overrides:
    Partial<PublicSnapshotRow> =
      {},
): PublicSnapshotRow {
  return {
    id: "snapshot-1",
    user_id: "user-a",
    scene_id: "scene-1",
    scene_name: "Focus",
    track_id: null,
    track_title: "Signal",
    track_artist: "Canal Artist",
    spotify_url: null,
    media_path: null,
    media_type: null,
    media_mime_type: null,
    position_ms: 4000,
    note: "Deep work",
    mood: "calm",
    visibility: "public",
    template_id: null,
    template_brand_label: null,
    template_theme: null,
    created_at:
      "2026-07-28T08:00:00.000Z",
    updated_at:
      "2026-07-28T09:00:00.000Z",
    ...overrides,
  };
}

describe(
  "public Snapshot discovery",
  () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockStorageFrom.mockReturnValue({
        createSignedUrls: jest.fn(async () => ({ data: [], error: null })),
      } as never);
    });

    it("signs Snapshot media in one bounded batch and reuses the scoped cache", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "viewer" } },
        error: null,
      } as never);

      const snapshotsQuery = {
        select: jest.fn(() => snapshotsQuery),
        eq: jest.fn(() => snapshotsQuery),
        order: jest.fn(() => snapshotsQuery),
        limit: jest.fn(async () => ({
          data: [
            snapshotRow({
              id: "snapshot-media-1",
              user_id: "viewer",
              media_path: "viewer/photo-1.jpg",
              media_type: "photo",
            }),
            snapshotRow({
              id: "snapshot-media-2",
              user_id: "viewer",
              media_path: "viewer/video-1.mp4",
              media_type: "video",
            }),
          ],
          error: null,
        })),
      };
      const creatorsQuery = {
        select: jest.fn(() => creatorsQuery),
        in: jest.fn(async () => ({
          data: [{
            id: "viewer",
            display_name: "Viewer",
            handle: "viewer",
            is_verified: false,
            is_canal: false,
          }],
          error: null,
        })),
      };
      const createSignedUrls = jest.fn(async () => ({
        data: [
          { path: "viewer/photo-1.jpg", signedUrl: "https://media.test/photo", error: null },
          { path: "viewer/video-1.mp4", signedUrl: "https://media.test/video", error: null },
        ],
        error: null,
      }));
      mockStorageFrom.mockReturnValue({ createSignedUrls } as never);
      mockFrom
        .mockReturnValueOnce(snapshotsQuery as never)
        .mockReturnValueOnce(creatorsQuery as never)
        .mockReturnValueOnce(snapshotsQuery as never)
        .mockReturnValueOnce(creatorsQuery as never);

      const first = await loadPublicSnapshotFeed();
      const second = await loadPublicSnapshotFeed();

      expect(createSignedUrls).toHaveBeenCalledTimes(1);
      expect(createSignedUrls).toHaveBeenCalledWith(
        ["viewer/photo-1.jpg", "viewer/video-1.mp4"],
        3600,
      );
      expect(first.map((snapshot) => snapshot.mediaUri)).toEqual([
        "https://media.test/photo",
        "https://media.test/video",
      ]);
      expect(second.map((snapshot) => snapshot.mediaUri)).toEqual([
        "https://media.test/photo",
        "https://media.test/video",
      ]);
    });

    it(
      "keeps only valid public Snapshots and preserves ownership",
      () => {
        const creators =
          new Map<
            string,
            PublicSnapshotCreator
          >([
            [
              "user-a",
              {
                id:
                  "user-a",
                displayName:
                  "Ari",
                handle:
                  "@ari",
                isVerified:
                  true,
                isCanal:
                  false,
              },
            ],
          ]);

        const result =
          normalizePublicSnapshotRows(
            [
              snapshotRow({
                scene_name:
                  " Focus ",
                note:
                  "  Deep work  ",
                position_ms:
                  -50,
              }),

              snapshotRow({
                id:
                  "private",
                visibility:
                  "private",
              }),

              snapshotRow({
                id:
                  "",
              }),
            ],
            "user-a",
            creators,
          );

        expect(
          result,
        ).toHaveLength(
          1,
        );

        expect(
          result[0],
        ).toMatchObject({
          id:
            "snapshot-1",
          sceneName:
            "Focus",
          note:
            "Deep work",
          positionMs: 0,
          ownerId:
            "user-a",
          isMine:
            true,
          pendingCloudSync:
            false,
          creator: {
            displayName:
              "Ari",
            handle:
              "@ari",
          },
        });
      },
    );

    it(
      "sorts newest first and anonymizes a missing public profile",
      () => {
        const result =
          normalizePublicSnapshotRows(
            [
              snapshotRow({
                id:
                  "older",
                updated_at:
                  "2026-07-28T09:00:00.000Z",
              }),

              snapshotRow({
                id:
                  "newer",
                user_id:
                  "user-b",
                updated_at:
                  "2026-07-28T10:00:00.000Z",
              }),
            ],
            "viewer",
          );

        expect(
          result.map(
            (snapshot) =>
              snapshot.id,
          ),
        ).toEqual([
          "newer",
          "older",
        ]);

        expect(
          result[0],
        ).toMatchObject({
          isMine:
            false,
          creator: {
            id:
              "user-b",
            displayName:
              "Canal Listener",
            handle:
              "@canal_listener",
          },
        });
      },
    );

    it(
      "drops a malicious public Snapshot Spotify link",
      () => {
        const [snapshot] =
          normalizePublicSnapshotRows(
            [
              snapshotRow({
                spotify_url:
                  "tel:+15551234567",
              }),
            ],
            "viewer",
          );

        expect(
          snapshot
            .spotifyUrl,
        ).toBeUndefined();
      },
    );

    it(
      "preserves only complete fixed-theme server provenance",
      () => {
        const snapshots =
          normalizePublicSnapshotRows(
            [
              snapshotRow({
                id:
                  "branded",
                template_id:
                  "00000000-0000-4000-8000-000000000001",
                template_brand_label:
                  "Ari FM",
                template_theme:
                  "sunset",
              }),
              snapshotRow({
                id:
                  "incomplete",
                template_id:
                  "00000000-0000-4000-8000-000000000002",
                template_brand_label:
                  null,
                template_theme:
                  "midnight",
              }),
            ],
            "viewer",
          );

        expect(
          snapshots[0],
        ).toMatchObject({
          templateId:
            "00000000-0000-4000-8000-000000000001",
          templateBrandLabel:
            "Ari FM",
          templateTheme:
            "sunset",
        });

        expect(
          snapshots[1],
        ).not.toHaveProperty(
          "templateId",
        );
      },
    );

    it(
      "does not return an earlier viewer's rows after a deferred account switch",
      async () => {
        let activeUserId =
          "user-a";

        mockGetUser.mockImplementation(
          async () =>
            ({
              data: {
                user: {
                  id:
                    activeUserId,
                },
              },
              error:
                null,
            }) as never,
        );

        const snapshotsQuery = {
          select:
            jest.fn(
              () =>
                snapshotsQuery,
            ),
          eq:
            jest.fn(
              () =>
                snapshotsQuery,
            ),
          order:
            jest.fn(
              () =>
                snapshotsQuery,
            ),
          limit:
            jest.fn(
              async () => ({
                data: [
                  snapshotRow(),
                ],
                error:
                  null,
              }),
            ),
        };

        let releaseCreators:
          (
            value: {
              data: {
                id: string;
                display_name:
                  string;
                handle:
                  string;
                is_verified:
                  boolean;
                is_canal:
                  boolean;
              }[];
              error: null;
            },
          ) => void =
            () => {
              throw new Error(
                "Creator read did not start.",
              );
            };

        let markCreatorsStarted:
          () => void =
            () => {};

        const creatorsStarted =
          new Promise<void>(
            (resolve) => {
              markCreatorsStarted =
                resolve;
            },
          );

        const creatorsQuery = {
          select:
            jest.fn(
              () =>
                creatorsQuery,
            ),
          in:
            jest.fn(
              () => {
                markCreatorsStarted();

                return new Promise<{
                  data: {
                    id: string;
                    display_name:
                      string;
                    handle:
                      string;
                    is_verified:
                      boolean;
                    is_canal:
                      boolean;
                  }[];
                  error: null;
                }>(
                  (resolve) => {
                    releaseCreators =
                      resolve;
                  },
                );
              },
            ),
        };

        mockFrom
          .mockReturnValueOnce(
            snapshotsQuery as never,
          )
          .mockReturnValueOnce(
            creatorsQuery as never,
          );

        const request =
          loadPublicSnapshotFeed();

        await creatorsStarted;

        activeUserId =
          "user-b";

        releaseCreators({
          data: [
            {
              id:
                "user-a",
              display_name:
                "Ari",
              handle:
                "ari",
              is_verified:
                false,
              is_canal:
                false,
            },
          ],
          error:
            null,
        });

        await expect(
          request,
        ).rejects.toThrow(
          "signed-in Canal account changed",
        );
      },
    );
  },
);
