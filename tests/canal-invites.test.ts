import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import {
  Platform,
  Share,
} from "react-native";

import {
  shareCanalInvite,
  shareStageInvite,
} from "../lib/canal-invites";
import * as liveStages
  from "../lib/live-stages";
import type {
  LiveStage,
} from "../lib/live-stages";

const ORIGINAL_NAVIGATOR_DESCRIPTOR =
  Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );

function liveStage(
  overrides:
    Partial<LiveStage> =
      {},
): LiveStage {
  return {
    id:
      "00000000-0000-4000-8000-000000000001",
    code:
      "248319",
    stageCode:
      "248319",
    name:
      "Friday Night Drive",
    hostId:
      "private-host-id",
    hostUsername:
      "maya.wav",
    hostName:
      "Maya Thompson",
    stageKind:
      "canal",
    hostIsVerified:
      true,
    hostIsCanal:
      true,
    sceneId:
      "private-scene-id",
    activity:
      "Driving through the city",
    visibility:
      "private",
    status:
      "live",
    participants: [
      {
        userId:
          "private-participant-id",
        username:
          "private.participant",
        displayName:
          "Private Participant",
        initials:
          "PP",
        role:
          "listener",
      },
    ],
    participantCount:
      1,
    listenerCount:
      1,
    tracks: [
      {
        id:
          "private-track-id",
        title:
          "Signal",
        artist:
          "Canal Artist",
        source:
          "Spotify",
        spotifyUri:
          "spotify:track:private-uri",
        spotifyUrl:
          "https://open.spotify.com/track/private-url",
      },
    ],
    currentTrackIndex:
      0,
    membershipRole:
      "listener",
    createdAt:
      "2026-07-28T18:00:00.000Z",
    updatedAt:
      "2026-07-28T19:00:00.000Z",
    ...overrides,
  };
}

function setPlatform(
  os: "ios" | "web",
): void {
  Object.defineProperty(
    Platform,
    "OS",
    {
      configurable:
        true,
      value:
        os,
    },
  );
}

function setNavigator(
  navigator:
    | {
        share?: (
          data: {
            title?: string;
            text?: string;
            url?: string;
          },
        ) => Promise<void>;
        clipboard?: {
          writeText: (
            value: string,
          ) => Promise<void>;
        };
      }
    | undefined,
): void {
  Object.defineProperty(
    globalThis,
    "navigator",
    {
      configurable:
        true,
      value:
        navigator,
    },
  );
}

describe(
  "Canal invite sharing",
  () => {
    beforeEach(
      () => {
        delete process.env
          .EXPO_PUBLIC_CANAL_SHARE_BASE_URL;
        setPlatform(
          "ios",
        );

        jest
          .spyOn(
            liveStages,
            "readLiveStage",
          )
          .mockImplementation(
            async (
              stageId,
            ) =>
              stageId ===
              liveStage().id
                ? liveStage()
                : null,
          );
      },
    );

    afterEach(
      () => {
        delete process.env
          .EXPO_PUBLIC_CANAL_SHARE_BASE_URL;

        if (
          ORIGINAL_NAVIGATOR_DESCRIPTOR
        ) {
          Object.defineProperty(
            globalThis,
            "navigator",
            ORIGINAL_NAVIGATOR_DESCRIPTOR,
          );
        } else {
          Reflect.deleteProperty(
            globalThis,
            "navigator",
          );
        }
      },
    );

    it(
      "shares only allowlisted Stage metadata and a canonical URL natively",
      async () => {
        process.env
          .EXPO_PUBLIC_CANAL_SHARE_BASE_URL =
          "https://Canal.Example/app///";

        const share =
          jest
            .spyOn(
              Share,
              "share",
            )
            .mockResolvedValue({
              action:
                Share.sharedAction,
            });

        const stage = {
          ...liveStage(),
          moderationRole:
            "private-admin-flag",
        } as LiveStage;

        await expect(
          shareStageInvite(
            stage,
          ),
        ).resolves.toEqual({
          method:
            "share",
        });

        expect(
          share,
        ).toHaveBeenCalledTimes(
          1,
        );

        const payload =
          share.mock.calls[0]?.[0];
        const serializedPayload =
          JSON.stringify(
            payload,
          );

        expect(
          payload,
        ).toMatchObject({
          title:
            "Friday Night Drive",
          url:
            "https://canal.example/app/live-stage/00000000-0000-4000-8000-000000000001?code=248319",
        });
        expect(
          payload?.message,
        ).toContain(
          "Hosted by Maya Thompson",
        );
        expect(
          payload?.message,
        ).toContain(
          "Driving through the city",
        );
        expect(
          payload?.message,
        ).toContain(
          "Now playing: Signal by Canal Artist",
        );
        expect(
          serializedPayload,
        ).not.toContain(
          "private-host-id",
        );
        expect(
          serializedPayload,
        ).not.toContain(
          "private-scene-id",
        );
        expect(
          serializedPayload,
        ).not.toContain(
          "private-participant-id",
        );
        expect(
          serializedPayload,
        ).not.toContain(
          "Private Participant",
        );
        expect(
          serializedPayload,
        ).not.toContain(
          "spotify:track:private-uri",
        );
        expect(
          serializedPayload,
        ).not.toContain(
          "open.spotify.com",
        );
        expect(
          serializedPayload,
        ).not.toContain(
          "private-admin-flag",
        );
        expect(
          serializedPayload,
        ).not.toContain(
          '"hostIsVerified"',
        );
        expect(
          serializedPayload,
        ).not.toContain(
          '"hostIsCanal"',
        );
        expect(
          serializedPayload,
        ).not.toContain(
          '"stageKind"',
        );
      },
    );

    it.each<
      [
        string,
        Partial<LiveStage>,
      ]
    >(
      [
        [
          "missing membership",
          {
            membershipRole:
              null,
          },
        ],
        [
          "ended status",
          {
            status:
              "ended",
          },
        ],
        [
          "non-UUID id",
          {
            id:
              "local-stage-1",
          },
        ],
        [
          "non-canonical uppercase UUID",
          {
            id:
              "00000000-0000-4000-8000-00000000000A",
          },
        ],
        [
          "short code",
          {
            code:
              "24831",
            stageCode:
              "24831",
          },
        ],
        [
          "non-numeric code",
          {
            code:
              "24A319",
            stageCode:
              "24A319",
          },
        ],
        [
          "different code aliases",
          {
            stageCode:
              "248318",
          },
        ],
      ],
    )(
      "rejects %s before a share or clipboard side effect",
      async (
        _label,
        overrides,
      ) => {
        setPlatform(
          "web",
        );

        const share =
          jest.fn(
            async () => {},
          );
        const writeText =
          jest.fn(
            async () => {},
          );

        setNavigator({
          share,
          clipboard: {
            writeText,
          },
        });

        await expect(
          shareStageInvite(
            liveStage(
              overrides,
            ),
          ),
        ).rejects.toThrow();

        expect(
          share,
        ).not.toHaveBeenCalled();
        expect(
          writeText,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rechecks current membership after an account switch before sharing",
      async () => {
        setPlatform(
          "web",
        );

        const share =
          jest.fn(
            async () => {},
          );
        const writeText =
          jest.fn(
            async () => {},
          );

        setNavigator({
          share,
          clipboard: {
            writeText,
          },
        });

        jest
          .spyOn(
            liveStages,
            "readLiveStage",
          )
          .mockResolvedValue(
            liveStage({
              membershipRole:
                null,
            }),
          );

        await expect(
          shareStageInvite(
            liveStage(),
          ),
        ).rejects.toThrow(
          "Join this Stage before sharing its invite.",
        );

        expect(
          share,
        ).not.toHaveBeenCalled();
        expect(
          writeText,
        ).not.toHaveBeenCalled();
      },
    );

    it.each(
      [
        "http://canal.example",
        "javascript:alert(1)",
        "https://user@canal.example",
        "https://user:secret@canal.example",
        "https://canal.example?campaign=private",
        "https://canal.example#private",
        "https://canal.example?",
        "https://canal.example#",
        "not a URL",
      ],
    )(
      "rejects invalid configured base %s before sharing",
      async (
        configuredBaseUrl,
      ) => {
        process.env
          .EXPO_PUBLIC_CANAL_SHARE_BASE_URL =
          configuredBaseUrl;

        const share =
          jest
            .spyOn(
              Share,
              "share",
            )
            .mockResolvedValue({
              action:
                Share.sharedAction,
            });

        await expect(
          shareStageInvite(
            liveStage(),
          ),
        ).rejects.toThrow(
          "Canal sharing is temporarily unavailable.",
        );
        expect(
          share,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "preserves prototype Stage sharing without a configured URL",
      async () => {
        const share =
          jest
            .spyOn(
              Share,
              "share",
            )
            .mockResolvedValue({
              action:
                Share.sharedAction,
            });

        await shareStageInvite(
          liveStage(),
        );

        expect(
          share,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            message:
              expect.stringContaining(
                "Stage code: 248319",
              ),
            url:
              undefined,
          }),
        );
      },
    );

    it(
      "returns cancelled when native sharing is dismissed",
      async () => {
        jest
          .spyOn(
            Share,
            "share",
          )
          .mockResolvedValue({
            action:
              Share.dismissedAction,
          });

        await expect(
          shareCanalInvite(),
        ).resolves.toEqual({
          method:
            "cancelled",
        });
      },
    );

    it(
      "uses web share with the canonical Stage URL",
      async () => {
        setPlatform(
          "web",
        );
        process.env
          .EXPO_PUBLIC_CANAL_SHARE_BASE_URL =
          "https://canal.example/";

        const share =
          jest.fn(
            async () => {},
          );
        const writeText =
          jest.fn(
            async () => {},
          );
        setNavigator({
          share,
          clipboard: {
            writeText,
          },
        });

        await expect(
          shareStageInvite(
            liveStage(),
          ),
        ).resolves.toEqual({
          method:
            "share",
        });
        expect(
          share,
        ).toHaveBeenCalledWith({
          title:
            "Friday Night Drive",
          text:
            expect.stringContaining(
              "Stage code: 248319",
            ),
          url:
            "https://canal.example/live-stage/00000000-0000-4000-8000-000000000001?code=248319",
        });
        expect(
          writeText,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "treats a web share abort as cancellation without copying",
      async () => {
        setPlatform(
          "web",
        );

        const abortError =
          new Error(
            "Sharing was cancelled.",
          );
        abortError.name =
          "AbortError";

        const writeText =
          jest.fn(
            async () => {},
          );
        setNavigator({
          share:
            jest.fn(
              async () => {
                throw abortError;
              },
            ),
          clipboard: {
            writeText,
          },
        });

        await expect(
          shareStageInvite(
            liveStage(),
          ),
        ).resolves.toEqual({
          method:
            "cancelled",
        });
        expect(
          writeText,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "falls back to the web clipboard when web share fails",
      async () => {
        setPlatform(
          "web",
        );
        process.env
          .EXPO_PUBLIC_CANAL_SHARE_BASE_URL =
          "https://canal.example";

        const writeText =
          jest.fn(
            async () => {},
          );
        setNavigator({
          share:
            jest.fn(
              async () => {
                throw new Error(
                  "Web share unavailable.",
                );
              },
            ),
          clipboard: {
            writeText,
          },
        });

        await expect(
          shareStageInvite(
            liveStage(),
          ),
        ).resolves.toEqual({
          method:
            "clipboard",
        });
        expect(
          writeText,
        ).toHaveBeenCalledWith(
          expect.stringContaining(
            "https://canal.example/live-stage/00000000-0000-4000-8000-000000000001?code=248319",
          ),
        );
      },
    );

    it(
      "keeps Canal invite sharing compatible with a normalized validated base",
      async () => {
        process.env
          .EXPO_PUBLIC_CANAL_SHARE_BASE_URL =
          "  https://canal.example/community///  ";

        const share =
          jest
            .spyOn(
              Share,
              "share",
            )
            .mockResolvedValue({
              action:
                Share.sharedAction,
            });

        await shareCanalInvite();

        expect(
          share,
        ).toHaveBeenCalledWith({
          title:
            "Join me on Canal",
          message:
            expect.stringContaining(
              "https://canal.example/community",
            ),
          url:
            "https://canal.example/community",
        });
      },
    );
  },
);
