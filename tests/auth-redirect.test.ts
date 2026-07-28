import {
  getPasswordResetRedirectUrl,
  PASSWORD_RESET_URL,
  rewriteIncomingCanalAuthPath,
} from "../lib/auth-redirect";

describe(
  "Canal authentication redirects",
  () => {
    const previousWebUrl =
      process.env
        .EXPO_PUBLIC_CANAL_WEB_URL;

    afterEach(() => {
      process.env
        .EXPO_PUBLIC_CANAL_WEB_URL =
        previousWebUrl;
    });

    it(
      "uses a path-safe installed-app reset URL",
      () => {
        delete process.env
          .EXPO_PUBLIC_CANAL_WEB_URL;

        expect(
          getPasswordResetRedirectUrl(),
        ).toBe(
          PASSWORD_RESET_URL,
        );

        expect(
          PASSWORD_RESET_URL,
        ).toBe(
          "canal:///auth/reset-password",
        );
      },
    );

    it(
      "uses an HTTPS browser fallback when configured",
      () => {
        process.env
          .EXPO_PUBLIC_CANAL_WEB_URL =
          "https://canal.example";

        expect(
          getPasswordResetRedirectUrl(),
        ).toBe(
          "https://canal.example/auth/reset-password",
        );
      },
    );

    it.each([
      [
        "canal://auth/reset-password?code=abc",
        "/auth/reset-password?code=abc",
      ],
      [
        "canal:///auth/reset-password#access_token=abc",
        "/auth/reset-password#access_token=abc",
      ],
      [
        "canal://auth/callback?code=abc",
        "/auth/callback?code=abc",
      ],
    ])(
      "rewrites %s into an Expo Router path",
      (
        incoming,
        expected,
      ) => {
        expect(
          rewriteIncomingCanalAuthPath(
            incoming,
          ),
        ).toBe(
          expected,
        );
      },
    );
  },
);
