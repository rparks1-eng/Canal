import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  captureCanalAccountSessionGuard,
  recordCanalAccountSession,
  runCanalAccountSessionMutation,
  signInWithEmail,
  signOutCanalAccount,
} from "../lib/canal-auth";

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
        getSession:
          jest.fn(),
        signOut:
          jest.fn(),
        signInWithPassword:
          jest.fn(),
      },
    },
  }),
);

const USER_A =
  "00000000-0000-4000-8000-000000000001";

const USER_B =
  "00000000-0000-4000-8000-000000000002";

const mockGetSession =
  jest.mocked(
    supabase.auth.getSession,
  );

const mockSignOut =
  jest.mocked(
    supabase.auth.signOut,
  );

const mockSignInWithPassword =
  jest.mocked(
    supabase.auth
      .signInWithPassword,
  );

function authResult(
  userId:
    string | null,
  sessionId =
    userId ===
      USER_A
      ? "session-a-1"
      : userId ===
          USER_B
        ? "session-b-1"
        : null,
) {
  const accessToken =
    sessionId
      ? `e30.${globalThis
          .btoa(
            JSON.stringify({
              session_id:
                sessionId,
            }),
          )
          .replace(
            /\+/g,
            "-",
          )
          .replace(
            /\//g,
            "_",
          )
          .replace(
            /=+$/u,
            "",
          )}.signature`
      : undefined;

  return {
    data: {
      session:
        userId
          ? {
              access_token:
                accessToken,
              user: {
                id:
                  userId,
              },
            }
          : null,
    },
    error: null,
  } as Awaited<
    ReturnType<
      typeof supabase.auth.getSession
    >
  >;
}

describe(
  "local Canal account session guard",
  () => {
    beforeEach(() => {
      mockGetSession
        .mockResolvedValue(
          authResult(
            USER_A,
          ),
        );

      mockSignOut
        .mockResolvedValue({
          error: null,
        });

      mockSignInWithPassword
        .mockResolvedValue({
          data: {
            user: {
              id:
                USER_B,
            },
            session: {
              user: {
                id:
                  USER_B,
              },
            },
          },
          error: null,
        } as Awaited<
          ReturnType<
            typeof supabase.auth
              .signInWithPassword
          >
        >);
    });

    it(
      "signs out only the local current session and verifies it ended",
      async () => {
        mockGetSession
          .mockResolvedValueOnce(
            authResult(
              USER_A,
            ),
          )
          .mockResolvedValueOnce(
            authResult(
              USER_A,
            ),
          )
          .mockResolvedValueOnce(
            authResult(
              USER_A,
            ),
          )
          .mockResolvedValueOnce(
            authResult(
              null,
            ),
          );

        const guard =
          await captureCanalAccountSessionGuard();

        await signOutCanalAccount(
          guard,
        );

        expect(
          mockSignOut,
        ).toHaveBeenCalledWith({
          scope: "local",
        });
      },
    );

    it(
      "rejects an account switch before sign-out without ending the replacement session",
      async () => {
        mockGetSession
          .mockResolvedValueOnce(
            authResult(
              USER_A,
            ),
          )
          .mockResolvedValueOnce(
            authResult(
              USER_B,
            ),
          );

        const guard =
          await captureCanalAccountSessionGuard();

        await expect(
          signOutCanalAccount(
            guard,
          ),
        ).rejects.toThrow(
          "account changed",
        );

        expect(
          mockSignOut,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects the same user when the stable Supabase session generation changes",
      async () => {
        mockGetSession
          .mockResolvedValueOnce(
            authResult(
              USER_A,
              "session-a-1",
            ),
          )
          .mockResolvedValueOnce(
            authResult(
              USER_A,
              "session-a-2",
            ),
          );

        const guard =
          await captureCanalAccountSessionGuard();

        await expect(
          signOutCanalAccount(
            guard,
          ),
        ).rejects.toThrow(
          "account changed",
        );

        expect(
          mockSignOut,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "surfaces a local sign-out that leaves the original session active",
      async () => {
        mockGetSession
          .mockResolvedValueOnce(
            authResult(
              USER_A,
            ),
          )
          .mockResolvedValueOnce(
            authResult(
              USER_A,
            ),
          )
          .mockResolvedValueOnce(
            authResult(
              USER_A,
            ),
          )
          .mockResolvedValueOnce(
            authResult(
              USER_A,
            ),
          );

        const guard =
          await captureCanalAccountSessionGuard();

        await expect(
          signOutCanalAccount(
            guard,
          ),
        ).rejects.toThrow(
          "still signed in",
        );
      },
    );

    it(
      "treats an SDK sign-out error as success when the local session is already gone",
      async () => {
        mockGetSession
          .mockResolvedValueOnce(
            authResult(
              USER_A,
            ),
          )
          .mockResolvedValueOnce(
            authResult(
              USER_A,
            ),
          )
          .mockResolvedValueOnce(
            authResult(
              USER_A,
            ),
          )
          .mockResolvedValueOnce(
            authResult(
              null,
            ),
          );

        mockSignOut
          .mockResolvedValueOnce({
            error:
              new Error(
                "network response lost",
              ),
          } as Awaited<
            ReturnType<
              typeof supabase.auth
                .signOut
            >
          >);

        const guard =
          await captureCanalAccountSessionGuard();

        await expect(
          signOutCanalAccount(
            guard,
          ),
        ).resolves.toBeUndefined();
      },
    );

    it(
      "serializes a replacement sign-in behind captured verification and local sign-out",
      async () => {
        let currentUserId:
          string | null =
            USER_A;

        const order:
          string[] = [];

        mockGetSession
          .mockImplementation(
            async () =>
              authResult(
                currentUserId,
              ),
          );

        mockSignOut
          .mockImplementation(
            async () => {
              order.push(
                `sign-out:${currentUserId}`,
              );

              currentUserId =
                null;

              return {
                error: null,
              };
            },
          );

        mockSignInWithPassword
          .mockImplementation(
            async () => {
              order.push(
                "sign-in:user-b",
              );

              currentUserId =
                USER_B;

              return {
                data: {
                  user: {
                    id:
                      USER_B,
                  },
                  session: {
                    user: {
                      id:
                        USER_B,
                    },
                  },
                },
                error: null,
              } as Awaited<
                ReturnType<
                  typeof supabase.auth
                    .signInWithPassword
                >
              >;
            },
          );

        let markBoundaryReached:
          () => void =
            () => {};

        const boundaryReached =
          new Promise<void>(
            (resolve) => {
              markBoundaryReached =
                resolve;
            },
          );

        let releaseBoundary:
          () => void =
            () => {};

        const boundaryGate =
          new Promise<void>(
            (resolve) => {
              releaseBoundary =
                resolve;
            },
          );

        const logout =
          runCanalAccountSessionMutation(
            async ({
              assertCurrent,
              signOutLocal,
            }) => {
              await assertCurrent();

              markBoundaryReached();

              await boundaryGate;

              await signOutLocal();
            },
          );

        await boundaryReached;

        const replacementSignIn =
          signInWithEmail(
            "replacement@example.com",
            "password",
          );

        await Promise.resolve();

        expect(
          mockSignInWithPassword,
        ).not.toHaveBeenCalled();

        releaseBoundary();

        await logout;
        await replacementSignIn;

        expect(
          order,
        ).toEqual([
          `sign-out:${USER_A}`,
          "sign-in:user-b",
        ]);
      },
    );

    it(
      "rejects an observed account switch at the final sign-out epoch boundary",
      async () => {
        mockGetSession
          .mockResolvedValue(
            authResult(
              USER_A,
            ),
          );

        await expect(
          runCanalAccountSessionMutation(
            async ({
              assertCurrent,
              signOutLocal,
            }) => {
              await assertCurrent();

              recordCanalAccountSession(
                USER_B,
              );

              await signOutLocal();
            },
          ),
        ).rejects.toThrow(
          "account changed",
        );

        expect(
          mockSignOut,
        ).not.toHaveBeenCalled();
      },
    );
  },
);
