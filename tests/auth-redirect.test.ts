import {
  AUTH_CALLBACK_URL,
  getAuthCallbackUrl,
  getPasswordResetRedirectUrl,
  PASSWORD_RESET_URL,
  rewriteIncomingCanalAuthPath,
} from "../lib/auth-redirect";

import fs from "node:fs";
import path from "node:path";

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
          getPasswordResetRedirectUrl("ios"),
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
          getPasswordResetRedirectUrl("web"),
        ).toBe(
          "https://canal.example/auth/reset-password",
        );
      },
    );

    it(
      "uses HTTPS auth callbacks only on web and preserves native schemes",
      () => {
        process.env.EXPO_PUBLIC_CANAL_WEB_URL =
          "https://canal.example/path";

        expect(getAuthCallbackUrl("web")).toBe(
          "https://canal.example/auth/callback",
        );
        expect(getPasswordResetRedirectUrl("web")).toBe(
          "https://canal.example/auth/reset-password",
        );
        expect(getAuthCallbackUrl("ios")).toBe(
          AUTH_CALLBACK_URL,
        );
        expect(getPasswordResetRedirectUrl("android")).toBe(
          PASSWORD_RESET_URL,
        );

        process.env.EXPO_PUBLIC_CANAL_WEB_URL =
          "https://user:secret@evil.example";
        expect(getAuthCallbackUrl("web")).toBe(
          "https://canal.app/auth/callback",
        );
      },
    );

    it(
      "routes signup and social OAuth through the platform-aware callback",
      () => {
        const source = fs.readFileSync(
          path.resolve(__dirname, "../lib/canal-auth.ts"),
          "utf8",
        );

        expect(source).toMatch(
          /emailRedirectTo:\s*getAuthCallbackUrl\(\)/u,
        );
        expect(source).toMatch(
          /const callbackUrl\s*=\s*getAuthCallbackUrl\(\)/u,
        );
        expect(source).toMatch(
          /redirectTo:\s*callbackUrl/u,
        );
        expect(source).toMatch(
          /openAuthSessionAsync\(\s*data[.]url,\s*callbackUrl/u,
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
