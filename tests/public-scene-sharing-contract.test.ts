import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import {
  readFileSync,
} from "node:fs";

import {
  join,
} from "node:path";

import * as Linking from "expo-linking";

import {
  publicSceneShareUrl,
  sceneShareText,
} from "../lib/scenes";

import type {
  StoredScene,
} from "../lib/scenes";

jest.mock(
  "expo-linking",
  () => ({
    createURL:
      jest.fn(
        (
          path: string,
          options?: {
            queryParams?: Record<
              string,
              string
            >;
          },
        ) => {
          const params =
            new URLSearchParams(
              options?.queryParams,
            );

          return `canal:///${path}?${params.toString()}`;
        },
      ),
  }),
);

const mockCreateURL =
  jest.mocked(
    Linking.createURL,
  );

const ORIGINAL_WEB_URL =
  process.env
    .EXPO_PUBLIC_CANAL_WEB_URL;
const ORIGINAL_SHARE_BASE_URL =
  process.env
    .EXPO_PUBLIC_CANAL_SHARE_BASE_URL;

const PUBLIC_SCENE =
  {
    id:
      "scene-with-spaces",
    name:
      "Sunday Reset",
    activity:
      "Resetting",
    duration:
      "30 minutes",
    emotions:
      "Peaceful",
    genres:
      "Ambient",
    energy:
      "Low",
    familiarity:
      "Balanced",
    artists:
      "Canal Artist",
    artistSelections:
      "",
    songRequest:
      "",
    avoid:
      "",
    collaborators: [],
    tracks: [
      {
        id:
          "private-provider-id",
        title:
          "Private Track Title",
        artist:
          "Canal Artist",
        spotifyUri:
          "spotify:track:private",
        spotifyUrl:
          "https://open.spotify.com/track/private",
      },
    ],
    visibility:
      "public",
    createdAt:
      "2026-07-29T00:00:00.000Z",
    updatedAt:
      "2026-07-29T00:00:00.000Z",
    libraryType:
      "created",
  } satisfies StoredScene;

describe(
  "public Scene sharing",
  () => {
    beforeEach(
      () => {
        delete process.env
          .EXPO_PUBLIC_CANAL_WEB_URL;
        delete process.env
          .EXPO_PUBLIC_CANAL_SHARE_BASE_URL;
      },
    );

    afterEach(
      () => {
        if (
          ORIGINAL_WEB_URL ===
          undefined
        ) {
          delete process.env
            .EXPO_PUBLIC_CANAL_WEB_URL;
        } else {
          process.env
            .EXPO_PUBLIC_CANAL_WEB_URL =
            ORIGINAL_WEB_URL;
        }

        if (
          ORIGINAL_SHARE_BASE_URL ===
          undefined
        ) {
          delete process.env
            .EXPO_PUBLIC_CANAL_SHARE_BASE_URL;
        } else {
          process.env
            .EXPO_PUBLIC_CANAL_SHARE_BASE_URL =
            ORIGINAL_SHARE_BASE_URL;
        }
      },
    );

    it(
      "builds an app return link with only the public lookup keys",
      () => {
        const url =
          publicSceneShareUrl(
            "owner id",
            "scene/id",
          );

        expect(
          mockCreateURL,
        ).toHaveBeenCalledWith(
          "public-scene",
          {
            queryParams: {
              ownerId:
                "owner id",
              sceneId:
                "scene/id",
            },
          },
        );

        expect(url).toBe(
          "canal:///public-scene?ownerId=owner+id&sceneId=scene%2Fid",
        );
        expect(url).not.toContain(
          "spotify",
        );
      },
    );

    it(
      "prefers the validated HTTPS Canal share base URL and preserves its path",
      () => {
        process.env
          .EXPO_PUBLIC_CANAL_SHARE_BASE_URL =
          "https://canal.example/app/";
        process.env
          .EXPO_PUBLIC_CANAL_WEB_URL =
          "https://fallback.example/";

        expect(
          publicSceneShareUrl(
            "owner id",
            "scene/id",
          ),
        ).toBe(
          "https://canal.example/app/public-scene?ownerId=owner+id&sceneId=scene%2Fid",
        );

        expect(
          mockCreateURL,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "uses the legacy web URL only when the share base URL is absent",
      () => {
        process.env
          .EXPO_PUBLIC_CANAL_WEB_URL =
          "https://canal.example/app/";

        expect(
          publicSceneShareUrl(
            "owner",
            "scene",
          ),
        ).toBe(
          "https://canal.example/app/public-scene?ownerId=owner&sceneId=scene",
        );
      },
    );

    it(
      "uses the legacy web URL when the share base URL is blank",
      () => {
        process.env
          .EXPO_PUBLIC_CANAL_SHARE_BASE_URL =
          "   ";
        process.env
          .EXPO_PUBLIC_CANAL_WEB_URL =
          "https://canal.example/";

        expect(
          publicSceneShareUrl(
            "owner",
            "scene",
          ),
        ).toBe(
          "https://canal.example/public-scene?ownerId=owner&sceneId=scene",
        );
      },
    );

    it.each([
      "http://canal.example",
      "https://user:password@canal.example",
      "https://canal.example?redirect=https://attacker.example",
      "not a URL",
    ])(
      "falls back to the app link for an unsafe web URL: %s",
      (configuredUrl) => {
        process.env
          .EXPO_PUBLIC_CANAL_SHARE_BASE_URL =
          configuredUrl;

        expect(
          publicSceneShareUrl(
            "owner",
            "scene",
          ),
        ).toBe(
          "canal:///public-scene?ownerId=owner&sceneId=scene",
        );
      },
    );

    it(
      "rejects missing or control-character lookup keys",
      () => {
        expect(
          () =>
            publicSceneShareUrl(
              " ",
              "scene",
            ),
        ).toThrow(
          "creator address is unavailable",
        );

        expect(
          () =>
            publicSceneShareUrl(
              "owner",
              "scene\nprivate",
            ),
        ).toThrow(
          "address is unavailable",
        );
      },
    );

    it(
      "adds the return link to the existing sanitized Scene summary",
      () => {
        const text =
          sceneShareText(
            PUBLIC_SCENE,
            "canal:///public-scene?ownerId=owner&sceneId=scene",
          );

        expect(text).toContain(
          "Canal Scene: Sunday Reset",
        );
        expect(text).toContain(
          "canal:///public-scene?ownerId=owner&sceneId=scene",
        );
        expect(text).not.toContain(
          "private-provider-id",
        );
        expect(text).not.toContain(
          "spotify:track:private",
        );
        expect(text).not.toContain(
          "open.spotify.com",
        );
      },
    );

    it(
      "keeps the public detail Share action accessible and isolated from save/export",
      () => {
        const source =
          readFileSync(
            join(
              process.cwd(),
              "app/public-scene.tsx",
            ),
            "utf8",
          );

        expect(source).toContain(
          "Share.share({",
        );
        expect(source).toContain(
          "publicSceneShareUrl(",
        );
        expect(source).toContain(
          "sceneShareText(",
        );
        expect(source).toContain(
          'accessibilityRole="alert"',
        );
        expect(source).toContain(
          "busy:",
        );
        expect(source).toContain(
          'accessibilityLabel={`Share ${item.scene.name}`}',
        );
        expect(source).toContain(
          "savePublicSceneToLibrary(",
        );
        expect(source).toContain(
          "exportSceneToMusicProvider(",
        );
      },
    );
  },
);
