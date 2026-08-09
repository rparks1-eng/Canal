import {
  readFileSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  filterExploreScenes,
  publicSceneMatchesQuery,
} from "../lib/explore-search";

import {
  discoverableProfilesFromScenes,
  profileIsBlocked,
} from "../lib/social-discovery";

import type {
  PublicCanalScene,
} from "../lib/social";

const PROJECT_ROOT =
  resolve(
    __dirname,
    "..",
  );

function source(
  path: string,
): string {
  return readFileSync(
    resolve(
      PROJECT_ROOT,
      path,
    ),
    "utf8",
  );
}

function publicScene(
  overrides: {
    ownerId?: string;
    name?: string;
    activity?: string;
    emotions?: string;
    artists?: string;
    creatorName?: string;
    creatorHandle?: string;
    trackArtist?: string;
    isMine?: boolean;
  } = {},
): PublicCanalScene {
  const ownerId =
    overrides.ownerId ??
    "11111111-1111-4111-8111-111111111111";

  return {
    ownerId,
    sceneId:
      `scene-${ownerId}`,
    scene: {
      id:
        `scene-${ownerId}`,
      name:
        overrides.name ??
        "Sunrise Focus",
      activity:
        overrides.activity ??
        "Deep work",
      emotions:
        overrides.emotions ??
        "Hopeful",
      genres:
        "Ambient, Electronic",
      artists:
        overrides.artists ??
        "Tycho",
      tracks: [
        {
          id: "track-1",
          title: "Awake",
          artist:
            overrides.trackArtist ??
            "ODESZA",
        },
      ],
    },
    creator: {
      id:
        ownerId,
      displayName:
        overrides.creatorName ??
        "Maya Rivers",
      handle:
        overrides.creatorHandle ??
        "@maya",
      bio:
        "Soundscapes for intentional days.",
      favoriteActivities:
        "Writing, walking",
      avatarUrl: null,
      isPublic: true,
      isVerified: false,
      isCanal: false,
    },
    updatedAt:
      "2026-08-08T00:00:00.000Z",
    savedByMe: false,
    isMine:
      overrides.isMine ??
      false,
  } as PublicCanalScene;
}

describe(
  "Repair Package B",
  () => {
    it.each([
      "sunrise",
      "deep work",
      "hopeful",
      "tycho",
      "odesza",
      "maya rivers",
      "@maya",
    ])(
      "matches Explore Scenes by %s and excludes unrelated Scenes",
      (query) => {
        const matching =
          publicScene();
        const unrelated =
          publicScene({
            ownerId:
              "22222222-2222-4222-8222-222222222222",
            name:
              "Night Run",
            activity:
              "Running",
            emotions:
              "Driven",
            artists:
              "Beyoncé",
            creatorName:
              "Jordan Lee",
            creatorHandle:
              "@jordan",
            trackArtist:
              "Kaytranada",
          });

        expect(
          filterExploreScenes(
            [
              matching,
              unrelated,
            ],
            query,
          ),
        ).toEqual([
          matching,
        ]);
      },
    );

    it(
      "requires every Explore search term to match a real Scene field",
      () => {
        expect(
          publicSceneMatchesQuery(
            publicScene(),
            "maya hopeful odesza",
          ),
        ).toBe(true);

        expect(
          publicSceneMatchesQuery(
            publicScene(),
            "maya unrelated",
          ),
        ).toBe(false);
      },
    );

    it(
      "builds deduplicated Find Friends results around stable profile IDs",
      () => {
        const profileId =
          "33333333-3333-4333-8333-333333333333";
        const first =
          publicScene({
            ownerId:
              profileId,
          });
        const second = {
          ...publicScene({
            ownerId:
              profileId,
            artists:
              "Bonobo",
          }),
          sceneId:
            "second-scene",
        };

        const profiles =
          discoverableProfilesFromScenes([
            first,
            second,
            publicScene({
              ownerId:
                "44444444-4444-4444-8444-444444444444",
              isMine: true,
            }),
          ]);

        expect(profiles).toHaveLength(1);
        expect(profiles[0]).toMatchObject({
          id:
            profileId,
          sceneCount: 2,
        });
        expect(
          profiles[0].artists,
        ).toEqual(
          expect.arrayContaining([
            "Tycho",
            "Bonobo",
            "ODESZA",
          ]),
        );
        expect(
          profileIsBlocked(
            profiles[0],
            [],
            [
              {
                username:
                  "legacy-name",
                targetUserId:
                  profileId,
              },
            ],
          ),
        ).toBe(true);
      },
    );

    it(
      "passes the stable Find Friends ID into follow mutations and profile navigation",
      () => {
        const friends =
          source(
            "app/friends.tsx",
          );

        expect(friends).toMatch(
          /followUser[(][\s\S]*username,[\s\S]*user[.]displayName,[\s\S]*user[.]id/u,
        );
        expect(friends).toMatch(
          /pathname:\s*"\/creator\/\[userId\]"[\s\S]*userId/u,
        );
      },
    );

    it(
      "exposes selected Library filters and a dismissible non-overlaying following error",
      () => {
        const library =
          source(
            "app/(tabs)/library.tsx",
          );
        const following =
          source(
            "app/following.tsx",
          );

        expect(library).toMatch(
          /accessibilityState=\{\{[\s\S]*selected:[\s\S]*filter ===[\s\S]*value/u,
        );
        expect(following).toContain(
          'accessibilityLabel="Dismiss following error"',
        );
        expect(following).toMatch(
          /page:\s*\{[\s\S]*paddingBottom:\s*120/u,
        );
        expect(following).not.toMatch(
          /error:\s*\{[\s\S]{0,300}position:\s*"absolute"/u,
        );
      },
    );

    it(
      "uses button, radio, and switch semantics for the audited controls",
      () => {
        const collection =
          source(
            "app/collections/new.tsx",
          );
        const templates =
          source(
            "app/snapshot-templates.tsx",
          );
        const snapshot =
          source(
            "app/scene-snapshot.tsx",
          );
        const invitation =
          source(
            "app/scene-collaboration.tsx",
          );
        const feedback =
          source(
            "app/scene-feedback.tsx",
          );

        for (const screen of [
          collection,
          templates,
        ]) {
          expect(screen).toMatch(
            /accessibilityRole="switch"[\s\S]*accessibilityState=\{\{[\s\S]*checked:/u,
          );
        }

        expect(templates).toContain(
          '"Create Snapshot template"',
        );
        expect(templates).toMatch(
          /smallButton:\s*\{[\s\S]*?minHeight:\s*48/u,
        );
        expect(snapshot).toMatch(
          /accessibilityRole="radiogroup"[\s\S]*accessibilityRole="radio"[\s\S]*checked:/u,
        );
        expect(invitation).toMatch(
          /label="Send invitation"[\s\S]*function PrimaryButton[\s\S]*accessibilityRole="button"/u,
        );
        expect(feedback).toMatch(
          /accessibilityRole="radiogroup"[\s\S]*accessibilityRole="radio"[\s\S]*checked:/u,
        );
        expect(feedback).toContain(
          'accessibilityLabel="Skip feedback"',
        );
      },
    );
  },
);
