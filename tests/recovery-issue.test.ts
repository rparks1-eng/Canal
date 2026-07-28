import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  classifyRecoveryIssue,
} from "../lib/recovery-issue";

describe(
  "recovery issue classification",
  () => {
    it(
      "uses connectivity evidence for an offline retry",
      () => {
        const issue =
          classifyRecoveryIssue(
            new Error(
              "Request failed",
            ),
            {
              service:
                "spotify",
              connectivityStatus:
                "offline",
            },
          );

        expect(
          issue,
        ).toMatchObject({
          kind:
            "offline",
          action:
            "retry",
          actionLabel:
            "Check connection",
        });
      },
    );

    it.each([
      {
        status: 401,
        kind:
          "spotify-auth",
      },
      {
        status: 403,
        kind:
          "spotify-permission",
      },
    ] as const)(
      "routes Spotify status $status to direct authorization recovery",
      ({
        status,
        kind,
      }) => {
        const error =
          Object.assign(
            new Error(
              "Spotify request failed",
            ),
            {
              status,
            },
          );

        const issue =
          classifyRecoveryIssue(
            error,
            {
              service:
                "spotify",
              connectivityStatus:
                "online",
            },
          );

        expect(
          issue,
        ).toMatchObject({
          kind,
          action:
            "reconnect-spotify",
          actionLabel:
            "Reconnect Spotify",
        });
      },
    );

    it(
      "does not mistake a generic Spotify failure for expired authorization",
      () => {
        const issue =
          classifyRecoveryIssue(
            new Error(
              "Spotify request failed",
            ),
            {
              service:
                "spotify",
              connectivityStatus:
                "online",
            },
          );

        expect(
          issue.kind,
        ).toBe(
          "service",
        );

        expect(
          issue.action,
        ).toBe(
          "retry",
        );
      },
    );

    it(
      "preserves a structured Spotify authorization issue while offline",
      () => {
        const issue =
          classifyRecoveryIssue(
            {
              message:
                "Spotify request failed",
              status: 401,
              authorizationInvalid:
                true,
            },
            {
              service:
                "spotify",
              connectivityStatus:
                "offline",
            },
          );

        expect(
          issue,
        ).toMatchObject({
          kind:
            "spotify-auth",
          action:
            "reconnect-spotify",
        });
      },
    );

    it(
      "routes a disconnected Spotify session to reconnection",
      () => {
        const issue =
          classifyRecoveryIssue(
            new Error(
              "Spotify is not connected.",
            ),
            {
              service:
                "spotify",
            },
          );

        expect(
          issue,
        ).toMatchObject({
          kind:
            "spotify-auth",
          action:
            "reconnect-spotify",
        });
      },
    );

    it(
      "recognizes plain-object network failures",
      () => {
        const issue =
          classifyRecoveryIssue(
            {
              message:
                "Failed to fetch",
            },
            {
              service:
                "spotify",
            },
          );

        expect(
          issue.kind,
        ).toBe(
          "offline",
        );
      },
    );

    it(
      "keeps Canal session recovery actionable while offline",
      () => {
        const issue =
          classifyRecoveryIssue(
            {
              message:
                "Canal session is missing.",
              status: 401,
            },
            {
              service:
                "canal",
              connectivityStatus:
                "offline",
            },
          );

        expect(
          issue,
        ).toMatchObject({
          kind:
            "canal-session",
          action:
            "sign-in",
          actionLabel:
            "Go to sign in",
        });
      },
    );

    it(
      "uses a Canal-specific offline message",
      () => {
        const issue =
          classifyRecoveryIssue(
            new Error(
              "Failed to fetch",
            ),
            {
              service:
                "canal",
            },
          );

        expect(
          issue,
        ).toMatchObject({
          kind:
            "offline",
          action:
            "retry",
        });

        expect(
          issue.message,
        ).toContain(
          "sync it with Canal",
        );
      },
    );

    it(
      "honors Spotify retry timing",
      () => {
        const error =
          Object.assign(
            new Error(
              "Too many requests",
            ),
            {
              status:
                429,
              retryAfterSeconds:
                12,
            },
          );

        expect(
          classifyRecoveryIssue(
            error,
            {
              service:
                "spotify",
            },
          ),
        ).toMatchObject({
          kind:
            "rate-limited",
          retryAfterMs:
            12000,
          message:
            "Try again in about 12 seconds.",
        });
      },
    );

    it(
      "recognizes the emitted rate-limiting phrase",
      () => {
        const issue =
          classifyRecoveryIssue(
            new Error(
              "Spotify is temporarily rate-limiting Canal. Try again shortly.",
            ),
            {
              service:
                "spotify",
              connectivityStatus:
                "online",
            },
          );

        expect(
          issue,
        ).toMatchObject({
          kind:
            "rate-limited",
          title:
            "Spotify needs a moment",
          action:
            "retry",
        });
      },
    );

    it(
      "presents long retry delays in a readable unit",
      () => {
        const issue =
          classifyRecoveryIssue(
            {
              message:
                "Too many requests",
              status: 429,
              retryAfterSeconds:
                82011,
            },
            {
              service:
                "spotify",
            },
          );

        expect(
          issue.message,
        ).toBe(
          "Try again in about 23 hours.",
        );

        expect(
          issue.retryAfterMs,
        ).toBe(
          82_011_000,
        );
      },
    );

    it(
      "does not expose invalid retry timing",
      () => {
        const issue =
          classifyRecoveryIssue(
            {
              message:
                "Too many requests",
              status: 429,
              retryAfterSeconds:
                -1,
            },
            {
              service:
                "canal",
            },
          );

        expect(
          issue,
        ).toMatchObject({
          kind:
            "rate-limited",
          title:
            "Canal needs a moment",
        });

        expect(
          issue.retryAfterMs,
        ).toBeUndefined();

        expect(
          issue.message,
        ).toContain(
          "Canal",
        );
      },
    );
  },
);
