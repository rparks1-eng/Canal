import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  deleteOwnAnalyticsEvents,
  normalizeAnalyticsEventInput,
  readAnalyticsControlState,
  recordAnalyticsEvent,
  recordSevenDayReturn,
  setAnalyticsConsent,
} from "../lib/analytics";

import {
  supabase,
} from "../lib/supabase";

import {
  mockStorage,
} from "./helpers/async-storage-mock";

jest.mock(
  "expo-crypto",
  () => ({
    randomUUID:
      jest.fn(
        () =>
          "00000000-0000-4000-8000-000000000099",
      ),
  }),
);

jest.mock(
  "../lib/supabase",
  () => ({
    isSupabaseConfigured:
      true,
    supabase: {
      auth: {
        getSession:
          jest.fn(),
        onAuthStateChange:
          jest.fn(),
      },
      from:
        jest.fn(),
    },
  }),
);

const USER_A =
  "00000000-0000-4000-8000-000000000001";

const USER_B =
  "00000000-0000-4000-8000-000000000002";

type AuthCallback = (
  event: string,
  session: {
    user: {
      id: string;
    };
  } | null,
) => void;

type QueryError = {
  code?: string;
  message: string;
};

const mockGetSession =
  jest.mocked(
    supabase.auth.getSession,
  );

const mockOnAuthStateChange =
  jest.mocked(
    supabase.auth.onAuthStateChange,
  );

const mockFrom =
  jest.mocked(
    supabase.from,
  );

let currentUserId =
  USER_A;

let authCallback:
  AuthCallback | null =
    null;

let insertError:
  QueryError | null =
    null;

let insertedRows:
  unknown[] =
    [];

let deleteCount =
  0;

function createQuery() {
  const query = {
    insert:
      jest.fn(
        async (
          row: unknown,
        ) => {
          insertedRows.push(
            row,
          );

          return {
            error:
              insertError,
          };
        },
      ),
    delete:
      jest.fn(
        () =>
          query,
      ),
    eq:
      jest.fn(
        async () => {
          deleteCount +=
            1;

          return {
            error:
              null,
          };
        },
      ),
  };

  return query;
}

describe(
  "privacy-limited analytics",
  () => {
    beforeEach(() => {
      mockStorage.clear();

      currentUserId =
        USER_A;

      insertError =
        null;

      insertedRows =
        [];

      deleteCount =
        0;

      mockGetSession.mockImplementation(
        async () =>
          ({
            data: {
              session: {
                user: {
                  id:
                    currentUserId,
                },
              },
            },
            error:
              null,
          }) as never,
      );

      mockOnAuthStateChange.mockImplementation(
        ((
          callback:
            AuthCallback,
        ) => {
          authCallback =
            callback;

          return {
            data: {
              subscription: {
                unsubscribe:
                  jest.fn(),
              },
            },
          } as never;
        }) as never,
      );

      mockFrom.mockImplementation(
        () =>
          createQuery() as never,
      );
    });

    it(
      "accepts only the fixed event contract and rejects arbitrary payloads",
      () => {
        expect(
          normalizeAnalyticsEventInput({
            name:
              "scene_export_completed",
            attempt:
              "retry",
          }),
        ).toEqual({
          name:
            "scene_export_completed",
          attempt:
            "retry",
        });

        expect(
          normalizeAnalyticsEventInput({
            name:
              "workflow_failed",
            failurePoint:
              "scene_export",
            failureClass:
              "offline",
          }),
        ).toEqual({
          name:
            "workflow_failed",
          failurePoint:
            "scene_export",
          failureClass:
            "offline",
          attempt:
            "initial",
        });

        for (
          const forbiddenKey of
            [
              "accessToken",
              "email",
              "error",
              "password",
              "resetUrl",
              "scene",
              "tracks",
              "url",
            ]
        ) {
          expect(
            normalizeAnalyticsEventInput({
              name:
                "snapshot_published",
              [forbiddenKey]:
                "must-not-pass",
            }),
          ).toBeNull();
        }
      },
    );

    it(
      "is off by default and records nothing before explicit consent",
      async () => {
        const result =
          await recordAnalyticsEvent({
            name:
              "first_scene_created",
          });

        expect(
          result,
        ).toMatchObject({
          accepted:
            false,
          delivered:
            false,
          reason:
            "disabled",
        });

        expect(
          mockFrom,
        ).not.toHaveBeenCalled();

        expect(
          Array.from(
            mockStorage.keys(),
          ),
        ).toEqual([]);
      },
    );

    it(
      "sends an exact content-free row and removes it from the local queue",
      async () => {
        await setAnalyticsConsent(
          true,
        );

        const result =
          await recordAnalyticsEvent({
            name:
              "snapshot_published",
            attempt:
              "retry",
          });

        expect(
          result,
        ).toMatchObject({
          accepted:
            true,
          delivered:
            true,
          reason:
            "delivered",
        });

        expect(
          insertedRows,
        ).toHaveLength(
          1,
        );

        expect(
          insertedRows[0],
        ).toEqual({
          client_event_id:
            "00000000-0000-4000-8000-000000000099",
          user_id:
            USER_A,
          event_name:
            "snapshot_published",
          failure_point:
            null,
          failure_class:
            null,
          attempt:
            "retry",
          platform:
            expect.stringMatching(
              /^(ios|android|web)$/,
            ),
          schema_version:
            1,
          occurred_at:
            expect.any(
              String,
            ),
        });

        expect(
          JSON.stringify(
            insertedRows[0],
          ),
        ).not.toMatch(
          /token|password|email|url|track|scene_name|error|payload/i,
        );

        expect(
          (
            await readAnalyticsControlState()
          ).queuedEventCount,
        ).toBe(
          0,
        );
      },
    );

    it(
      "keeps a bounded sanitized event queued when delivery is offline",
      async () => {
        insertError = {
          message:
            "network unavailable",
        };

        await setAnalyticsConsent(
          true,
        );

        const result =
          await recordAnalyticsEvent({
            name:
              "workflow_failed",
            failurePoint:
              "snapshot_publish",
            failureClass:
              "offline",
          });

        expect(
          result,
        ).toMatchObject({
          accepted:
            true,
          delivered:
            false,
          reason:
            "queued",
        });

        const storedQueue =
          Array.from(
            mockStorage.entries(),
          ).find(
            ([
              key,
            ]) =>
              key.includes(
                "/queue",
              ),
          )?.[1] ??
          "";

        expect(
          storedQueue,
        ).toContain(
          "snapshot_publish",
        );

        expect(
          storedQueue,
        ).not.toMatch(
          /network unavailable|token|password|email|reset|url|track/i,
        );
      },
    );

    it(
      "purges local events and requests owner-scoped cloud deletion on opt-out",
      async () => {
        insertError = {
          message:
            "offline",
        };

        await setAnalyticsConsent(
          true,
        );

        await recordAnalyticsEvent({
          name:
            "onboarding_completed",
        });

        insertError =
          null;

        const result =
          await setAnalyticsConsent(
            false,
          );

        expect(
          result,
        ).toMatchObject({
          enabled:
            false,
          queuedEventCount:
            0,
          cloudDeleted:
            true,
        });

        expect(
          deleteCount,
        ).toBeGreaterThan(
          0,
        );

        expect(
          (
            await readAnalyticsControlState()
          ).enabled,
        ).toBe(
          false,
        );
      },
    );

    it(
      "does not clear another account's queue during deletion",
      async () => {
        insertError = {
          message:
            "offline",
        };

        await setAnalyticsConsent(
          true,
        );

        await recordAnalyticsEvent({
          name:
            "snapshot_published",
        });

        currentUserId =
          USER_B;

        authCallback?.(
          "SIGNED_IN",
          {
            user: {
              id:
                USER_B,
            },
          },
        );

        await setAnalyticsConsent(
          true,
        );

        await recordAnalyticsEvent({
          name:
            "scene_export_completed",
        });

        await deleteOwnAnalyticsEvents();

        const queueValue =
          Array.from(
            mockStorage.entries(),
          ).find(
            ([
              key,
            ]) =>
              key.includes(
                "/queue",
              ),
          )?.[1] ??
          "[]";

        const queue =
          JSON.parse(
            queueValue,
          ) as
            {
              userId:
                string;
            }[];

        expect(
          queue.map(
            (event) =>
              event.userId,
          ),
        ).toEqual([
          USER_A,
        ]);
      },
    );

    it(
      "records seven-day return only inside the day-seven window",
      async () => {
        await setAnalyticsConsent(
          true,
        );

        const now =
          Date.parse(
            "2026-07-28T12:00:00.000Z",
          );

        expect(
          (
            await recordSevenDayReturn(
              "2026-07-21T11:59:59.000Z",
              now,
            )
          ).accepted,
        ).toBe(
          true,
        );

        expect(
          (
            await recordSevenDayReturn(
              "2026-07-20T11:59:59.000Z",
              now,
            )
          ).accepted,
        ).toBe(
          false,
        );
      },
    );
  },
);
