import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  createLiveStage,
  joinLiveStageByCode,
  moderateLiveStageMember,
  moderateLiveStageMessage,
  readLiveStage,
  readLiveStages,
  reportLiveStageMessage,
  subscribeToLiveStage,
} from "../lib/live-stages";
import type {
  LiveStageMemberModerationAction,
  LiveStageMemberRow,
  LiveStageReportReason,
  LiveStageRow,
} from "../lib/live-stages";
import {
  supabase,
} from "../lib/supabase";

const VALID_SPOTIFY_TRACK_ID =
  "4uLU6hMCjMI75M1A2tKUQC";

const VALID_SPOTIFY_IMAGE_TOKEN =
  "ab67616d0000b273d6f4a718b4b61e40";

let mockBroadcastHandler:
  ((
    payload?: unknown,
  ) => void) | null =
    null;

let mockSubscribeHandler:
  ((
    status: string,
  ) => void) | null =
    null;

type MockChannel = {
  on: ReturnType<
    typeof jest.fn
  >;
  subscribe: ReturnType<
    typeof jest.fn
  >;
};

let mockChannel:
  MockChannel;

const mockOn =
  jest.fn(
    (
      _type: string,
      _filter: {
        event: string;
      },
      handler: (
        payload?: unknown,
      ) => void,
    ) => {
      mockBroadcastHandler =
        handler;

      return mockChannel;
    },
  );

const mockSubscribe =
  jest.fn(
    (
      handler: (
        status: string,
      ) => void,
    ) => {
      mockSubscribeHandler =
        handler;

      return mockChannel;
    },
  );

mockChannel = {
  on:
    mockOn,
  subscribe:
    mockSubscribe,
};

jest.mock(
  "../lib/supabase",
  () => ({
    isSupabaseConfigured:
      true,
    requireSupabaseConfiguration:
      jest.fn(),
    supabase: {
      auth: {
        getUser:
          jest.fn(),
      },
      channel:
        jest.fn(),
      from:
        jest.fn(),
      realtime: {
        setAuth:
          jest.fn(),
      },
      removeChannel:
        jest.fn(),
      rpc:
        jest.fn(),
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

const mockRpc =
  jest.mocked(
    supabase.rpc,
  );

const mockRealtimeSetAuth =
  jest.mocked(
    supabase.realtime
      .setAuth,
  );

const mockChannelFactory =
  jest.mocked(
    supabase.channel,
  );

const mockRemoveChannel =
  jest.mocked(
    supabase.removeChannel,
  );

function cloudStageRow(
  overrides:
    Partial<LiveStageRow> =
      {},
): LiveStageRow {
  return {
    id:
      "00000000-0000-4000-8000-000000000001",
    host_id:
      "user-current",
    host_display_name:
      "Current Listener",
    host_handle:
      "current",
    stage_kind:
      "community",
    host_is_verified:
      false,
    host_is_canal:
      false,
    scene_id:
      null,
    stage_code:
      "248319",
    name:
      "Cloud Stage",
    activity:
      "Listening together",
    visibility:
      "private",
    status:
      "live",
    tracks: [],
    current_track_index:
      0,
    created_at:
      "2026-07-28T20:00:00.000Z",
    updated_at:
      "2026-07-28T20:00:00.000Z",
    ended_at:
      null,
    ...overrides,
  };
}

function insertQuery(
  result: {
    data: LiveStageRow | null;
    error:
      | {
          code?: string;
          message: string;
        }
      | null;
  },
  payloads:
    Record<
      string,
      unknown
    >[],
) {
  const query = {
    insert:
      jest.fn(
        (
          payload: Record<
            string,
            unknown
          >,
        ) => {
          payloads.push(
            payload,
          );

          return query;
        },
      ),
    select:
      jest.fn(
        () =>
          query,
      ),
    single:
      jest.fn(
        async () =>
          result,
      ),
  };

  return query;
}

function stageReadQuery(
  row: LiveStageRow | null,
) {
  const query = {
    select:
      jest.fn(
        () =>
          query,
      ),
    eq:
      jest.fn(
        () =>
          query,
      ),
    maybeSingle:
      jest.fn(
        async () => ({
          data:
            row,
          error:
            null,
        }),
      ),
  };

  return query;
}

function memberReadQuery(
  rows:
    LiveStageMemberRow[],
) {
  const query = {
    select:
      jest.fn(
        () =>
          query,
      ),
    in:
      jest.fn(
        () =>
          query,
      ),
    order:
      jest.fn(
        async () => ({
          data:
            rows,
          error:
            null,
        }),
      ),
  };

  return query;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function emitBroadcast(
  payload?: unknown,
): void {
  const handler =
    mockBroadcastHandler;

  handler?.(
    payload,
  );
}

function emitSubscriptionStatus(
  status: string,
): void {
  const handler =
    mockSubscribeHandler;

  handler?.(
    status,
  );
}

describe(
  "live Stage cloud contracts",
  () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockBroadcastHandler =
        null;
      mockSubscribeHandler =
        null;
      mockGetUser.mockResolvedValue({
        data: {
          user: {
            id:
              "user-current",
          },
        },
        error: null,
      } as never);
      mockRealtimeSetAuth.mockResolvedValue(
        undefined,
      );
      mockChannelFactory.mockReturnValue(
        mockChannel as never,
      );
      mockRemoveChannel.mockResolvedValue(
        "ok" as never,
      );
    });

    it(
      "filters live Stages on the server before ordering and limiting",
      async () => {
        const calls:
          string[] =
            [];

        const query = {
          select:
            jest.fn(
              () => {
                calls.push(
                  "select",
                );

                return query;
              },
            ),
          eq:
            jest.fn(
              (
                column: string,
                value: string,
              ) => {
                calls.push(
                  `eq:${column}:${value}`,
                );

                return query;
              },
            ),
          order:
            jest.fn(
              () => {
                calls.push(
                  "order",
                );

                return query;
              },
            ),
          limit:
            jest.fn(
              async () => {
                calls.push(
                  "limit",
                );

                return {
                  data: [],
                  error:
                    null,
                };
              },
            ),
        };

        mockFrom.mockReturnValueOnce(
          query as never,
        );

        await expect(
          readLiveStages(),
        ).resolves.toEqual(
          [],
        );

        expect(
          calls,
        ).toEqual([
          "select",
          "eq:status:live",
          "order",
          "limit",
        ]);
      },
    );

    it(
      "does not return a prior account's Stage membership after a deferred member read",
      async () => {
        const row =
          cloudStageRow();

        let activeUserId =
          "user-current";

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

        let releaseMemberRead:
          (
            value: {
              data:
                LiveStageMemberRow[];
              error: null;
            },
          ) => void =
            () => {
              throw new Error(
                "Member read did not start.",
              );
            };

        let markMemberReadStarted:
          () => void =
            () => {};

        const memberReadStarted =
          new Promise<void>(
            (resolve) => {
              markMemberReadStarted =
                resolve;
            },
          );

        const memberQuery = {
          select:
            jest.fn(
              () =>
                memberQuery,
            ),
          in:
            jest.fn(
              () =>
                memberQuery,
            ),
          order:
            jest.fn(
              () => {
                markMemberReadStarted();

                return new Promise<{
                  data:
                    LiveStageMemberRow[];
                  error: null;
                }>(
                  (resolve) => {
                    releaseMemberRead =
                      resolve;
                  },
                );
              },
            ),
        };

        mockFrom
          .mockReturnValueOnce(
            stageReadQuery(
              row,
            ) as never,
          )
          .mockReturnValueOnce(
            memberQuery as never,
          );

        const request =
          readLiveStage(
            row.id,
          );

        await memberReadStarted;

        activeUserId =
          "user-replacement";

        releaseMemberRead({
          data: [
            {
              stage_id:
                row.id,
              user_id:
                "user-current",
              display_name:
                "Current Listener",
              handle:
                "current",
              role:
                "listener",
              joined_at:
                "2026-07-28T20:00:00.000Z",
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

    it(
      "authenticates and subscribes to one private Stage Broadcast topic",
      async () => {
        let releaseAuth:
          () => void =
            () => {
              throw new Error(
                "Realtime auth did not start.",
              );
            };

        mockRealtimeSetAuth.mockReturnValueOnce(
          new Promise<void>(
            (resolve) => {
              releaseAuth =
                resolve;
            },
          ),
        );

        const onChange =
          jest.fn();
        const onStatus =
          jest.fn();

        const cleanup =
          subscribeToLiveStage(
            "stage-1",
            onChange,
            onStatus,
          );

        expect(
          onStatus,
        ).toHaveBeenCalledWith(
          "connecting",
        );
        expect(
          mockChannelFactory,
        ).not.toHaveBeenCalled();

        releaseAuth();
        await flushPromises();

        expect(
          mockChannelFactory,
        ).toHaveBeenCalledWith(
          "live-stage:stage-1",
          {
            config: {
              private:
                true,
            },
          },
        );
        expect(
          mockOn,
        ).toHaveBeenCalledWith(
          "broadcast",
          {
            event:
              "stage_changed",
          },
          expect.any(
            Function,
          ),
        );

        emitSubscriptionStatus(
          "SUBSCRIBED",
        );

        expect(
          onStatus,
        ).toHaveBeenLastCalledWith(
          "connected",
        );

        emitBroadcast({
          payload: {
            stage_id:
              "stage-1",
            members: [
              {
                user_id:
                  "untrusted-row",
              },
            ],
            messages: [
              {
                body:
                  "untrusted message",
              },
            ],
          },
        });

        expect(
          onChange,
        ).toHaveBeenCalledTimes(
          1,
        );
        expect(
          onChange,
        ).toHaveBeenCalledWith();

        emitSubscriptionStatus(
          "CHANNEL_ERROR",
        );

        expect(
          onStatus,
        ).toHaveBeenLastCalledWith(
          "error",
        );

        cleanup();

        expect(
          mockRemoveChannel,
        ).toHaveBeenCalledWith(
          mockChannel,
        );
      },
    );

    it(
      "does not open a private channel after cleanup wins the auth race",
      async () => {
        let releaseAuth:
          () => void =
            () => {
              throw new Error(
                "Realtime auth did not start.",
              );
            };

        mockRealtimeSetAuth.mockReturnValueOnce(
          new Promise<void>(
            (resolve) => {
              releaseAuth =
                resolve;
            },
          ),
        );

        const cleanup =
          subscribeToLiveStage(
            "stage-2",
            jest.fn(),
          );

        cleanup();

        releaseAuth();
        await flushPromises();

        expect(
          mockChannelFactory,
        ).not.toHaveBeenCalled();
        expect(
          mockRemoveChannel,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "shares one private channel across overlapping Stage subscribers",
      async () => {
        const firstChange = jest.fn();
        const secondChange = jest.fn();

        const cleanupFirst = subscribeToLiveStage("stage-shared", firstChange);
        await flushPromises();
        const cleanupSecond = subscribeToLiveStage("stage-shared", secondChange);

        expect(mockRealtimeSetAuth).toHaveBeenCalledTimes(1);
        expect(mockChannelFactory).toHaveBeenCalledTimes(1);

        emitBroadcast();
        expect(firstChange).toHaveBeenCalledTimes(1);
        expect(secondChange).toHaveBeenCalledTimes(1);

        cleanupFirst();
        expect(mockRemoveChannel).not.toHaveBeenCalled();

        emitBroadcast();
        expect(firstChange).toHaveBeenCalledTimes(1);
        expect(secondChange).toHaveBeenCalledTimes(2);

        cleanupSecond();
        expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
        expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
      },
    );

    it(
      "lets the database generate Stage codes and retries a unique collision",
      async () => {
        const row =
          cloudStageRow();
        const payloads:
          Record<
            string,
            unknown
          >[] =
            [];

        mockFrom
          .mockReturnValueOnce(
            insertQuery(
              {
                data: null,
                error: {
                  code:
                    "23505",
                  message:
                    "duplicate stage code",
                },
              },
              payloads,
            ) as never,
          )
          .mockReturnValueOnce(
            insertQuery(
              {
                data:
                  row,
                error:
                  null,
              },
              payloads,
            ) as never,
          )
          .mockReturnValueOnce(
            stageReadQuery(
              row,
            ) as never,
          )
          .mockReturnValueOnce(
            memberReadQuery(
              [],
            ) as never,
          );

        const stage =
          await createLiveStage({
            name:
              "Cloud Stage",
          });

        expect(
          stage.stageCode,
        ).toBe(
          "248319",
        );
        expect(
          payloads,
        ).toHaveLength(
          2,
        );

        for (
          const payload of
          payloads
        ) {
          expect(
            payload,
          ).not.toHaveProperty(
            "stage_code",
          );
        }
      },
    );

    it(
      "rejects an invite result that does not resolve to the requested live membership",
      async () => {
        const row =
          cloudStageRow({
            stage_code:
              "111111",
          });

        mockRpc.mockResolvedValueOnce(
          [
            {
              id:
                row.id,
            },
          ] as never,
        );
        mockFrom
          .mockReturnValueOnce(
            stageReadQuery(
              row,
            ) as never,
          )
          .mockReturnValueOnce(
            memberReadQuery([
              {
                stage_id:
                  row.id,
                user_id:
                  "user-current",
                display_name:
                  "Current Listener",
                handle:
                  "current",
                role:
                  "listener",
                joined_at:
                  "2026-07-28T20:00:00.000Z",
              },
            ]) as never,
          );

        await expect(
          joinLiveStageByCode(
            "248319",
          ),
        ).resolves.toBeNull();

        expect(
          mockRpc,
        ).toHaveBeenCalledWith(
          "join_live_stage_by_code",
          {
            stage_code_value:
              "248319",
            expected_stage_id:
              null,
          },
        );
      },
    );

    it(
      "sanitizes track links and field bounds before a cloud write",
      async () => {
        mockFrom.mockReset();

        const row =
          cloudStageRow();
        const payloads:
          Record<
            string,
            unknown
          >[] =
            [];

        mockFrom
          .mockReturnValueOnce(
            insertQuery(
              {
                data:
                  row,
                error:
                  null,
              },
              payloads,
            ) as never,
          )
          .mockReturnValueOnce(
            stageReadQuery(
              row,
            ) as never,
          )
          .mockReturnValueOnce(
            memberReadQuery(
              [],
            ) as never,
          );

        await createLiveStage({
          name:
            "Safe Track Stage",
          tracks: [
            {
              id:
                "safe-track",
              title:
                "Safe Track",
              artist:
                "Canal Artist",
              source:
                "Spotify",
              spotifyUri:
                `spotify:track:${VALID_SPOTIFY_TRACK_ID}`,
              imageUrl:
                `https://i.scdn.co/image/${VALID_SPOTIFY_IMAGE_TOKEN}`,
            },
            {
              id:
                "unsafe-track",
              title:
                "Unsafe Link",
              artist:
                "Canal Artist",
              source:
                "Spotify",
              spotifyUrl:
                `https://open.spotify.com.evil.example/track/${VALID_SPOTIFY_TRACK_ID}`,
              imageUrl:
                `http://i.scdn.co/image/${VALID_SPOTIFY_IMAGE_TOKEN}`,
              durationMs:
                86_400_001,
            },
            {
              id:
                "oversize-track",
              title:
                "T".repeat(
                  201,
                ),
              artist:
                "Canal Artist",
              source:
                "Canal",
            },
          ],
        });

        expect(
          payloads[0]?.tracks,
        ).toEqual([
          {
            id:
              "safe-track",
            title:
              "Safe Track",
            artist:
              "Canal Artist",
            source:
              "Spotify",
            spotifyUri:
              `spotify:track:${VALID_SPOTIFY_TRACK_ID}`,
            spotifyUrl:
              `https://open.spotify.com/track/${VALID_SPOTIFY_TRACK_ID}`,
            imageUrl:
              `https://i.scdn.co/image/${VALID_SPOTIFY_IMAGE_TOKEN}`,
          },
          {
            id:
              "unsafe-track",
            title:
              "Unsafe Link",
            artist:
              "Canal Artist",
            source:
              "Spotify",
          },
        ]);
      },
    );

    it(
      "passes the expected route Stage into the join RPC and rejects a mismatched result",
      async () => {
        const returnedStageId =
          "00000000-0000-4000-8000-000000000001";
        const expectedStageId =
          "00000000-0000-4000-8000-000000000002";

        mockRpc.mockResolvedValueOnce(
          [
            {
              id:
                returnedStageId,
            },
          ] as never,
        );

        await expect(
          joinLiveStageByCode(
            "248319",
            expectedStageId,
          ),
        ).resolves.toBeNull();

        expect(
          mockRpc,
        ).toHaveBeenCalledWith(
          "join_live_stage_by_code",
          {
            stage_code_value:
              "248319",
            expected_stage_id:
              expectedStageId,
          },
        );
        expect(
          mockFrom,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects an invalid expected route Stage before invoking the join RPC",
      async () => {
        await expect(
          joinLiveStageByCode(
            "248319",
            "not-a-stage-id",
          ),
        ).resolves.toBeNull();

        expect(
          mockRpc,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "sends bounded report and moderation payloads through their exact RPCs",
      async () => {
        const stageId =
          "00000000-0000-4000-8000-000000000001";
        const messageId =
          "00000000-0000-4000-8000-000000000002";
        const targetUserId =
          "00000000-0000-4000-8000-000000000003";

        mockRpc.mockResolvedValue({
          data: null,
          error: null,
        } as never);

        await reportLiveStageMessage(
          stageId,
          messageId,
          "harassment",
        );
        await moderateLiveStageMember(
          stageId,
          targetUserId,
          "remove",
          "  repeated abuse  ",
        );
        await moderateLiveStageMessage(
          stageId,
          messageId,
        );

        expect(
          mockRpc.mock.calls,
        ).toEqual([
          [
            "report_live_stage_message",
            {
              stage_id_value:
                stageId,
              message_id_value:
                messageId,
              reason_value:
                "harassment",
              expected_actor_id_value:
                "user-current",
            },
          ],
          [
            "moderate_live_stage_member",
            {
              stage_id_value:
                stageId,
              target_user_id_value:
                targetUserId,
              action_value:
                "remove",
              reason_value:
                "repeated abuse",
              expected_actor_id_value:
                "user-current",
            },
          ],
          [
            "moderate_live_stage_message",
            {
              stage_id_value:
                stageId,
              message_id_value:
                messageId,
              reason_value:
                null,
              expected_actor_id_value:
                "user-current",
            },
          ],
        ]);
      },
    );

    it(
      "rejects invalid moderation input before auth or RPC I/O",
      async () => {
        const stageId =
          "00000000-0000-4000-8000-000000000001";
        const messageId =
          "00000000-0000-4000-8000-000000000002";
        const targetUserId =
          "00000000-0000-4000-8000-000000000003";

        await expect(
          reportLiveStageMessage(
            "not-a-stage-id",
            messageId,
            "spam",
          ),
        ).rejects.toThrow(
          "valid Stage",
        );
        await expect(
          reportLiveStageMessage(
            stageId,
            "not-a-message-id",
            "spam",
          ),
        ).rejects.toThrow(
          "valid message",
        );
        await expect(
          reportLiveStageMessage(
            stageId,
            messageId,
            "phishing" as
              LiveStageReportReason,
          ),
        ).rejects.toThrow(
          "valid report reason",
        );
        await expect(
          moderateLiveStageMember(
            stageId,
            "not-a-member-id",
            "remove",
          ),
        ).rejects.toThrow(
          "valid member",
        );
        await expect(
          moderateLiveStageMember(
            stageId,
            targetUserId,
            "ban" as
              LiveStageMemberModerationAction,
          ),
        ).rejects.toThrow(
          "valid moderation action",
        );
        await expect(
          moderateLiveStageMessage(
            stageId,
            messageId,
            "unsafe\nreason",
          ),
        ).rejects.toThrow(
          "240 characters",
        );
        await expect(
          moderateLiveStageMessage(
            stageId,
            messageId,
            "😀".repeat(
              241,
            ),
          ),
        ).rejects.toThrow(
          "240 characters",
        );

        expect(
          mockGetUser,
        ).not.toHaveBeenCalled();
        expect(
          mockRpc,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "surfaces actionable moderation RPC errors",
      async () => {
        mockRpc.mockResolvedValueOnce({
          data: null,
          error: {
            message:
              "Only a Stage host can remove members.",
          },
        } as never);

        await expect(
          moderateLiveStageMember(
            "00000000-0000-4000-8000-000000000001",
            "00000000-0000-4000-8000-000000000003",
            "remove",
          ),
        ).rejects.toThrow(
          "Canal could not moderate this Stage member: Only a Stage host can remove members.",
        );
      },
    );

    it(
      "rejects moderation success when the signed-in account changes during the RPC",
      async () => {
        mockGetUser
          .mockResolvedValueOnce({
            data: {
              user: {
                id:
                  "user-current",
              },
            },
            error: null,
          } as never)
          .mockResolvedValueOnce({
            data: {
              user: {
                id:
                  "user-replacement",
              },
            },
            error: null,
          } as never);
        mockRpc.mockResolvedValueOnce({
          data: null,
          error: null,
        } as never);

        await expect(
          reportLiveStageMessage(
            "00000000-0000-4000-8000-000000000001",
            "00000000-0000-4000-8000-000000000002",
            "unsafe_content",
          ),
        ).rejects.toThrow(
          "signed-in Canal account changed",
        );

        expect(
          mockRpc,
        ).toHaveBeenCalledWith(
          "report_live_stage_message",
          expect.objectContaining({
            expected_actor_id_value:
              "user-current",
          }),
        );
      },
    );
  },
);
