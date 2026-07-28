import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  DEFAULT_CANAL_SETTINGS,
  normalizeCanalSettings,
} from "../lib/app-settings";

describe(
  "Canal settings normalization",
  () => {
    it(
      "returns safe defaults for invalid persisted data",
      () => {
        expect(
          normalizeCanalSettings(
            null,
          ),
        ).toEqual(
          DEFAULT_CANAL_SETTINGS,
        );

        expect(
          normalizeCanalSettings(
            "not-an-object",
          ),
        ).toEqual(
          DEFAULT_CANAL_SETTINGS,
        );
      },
    );

    it(
      "preserves valid values and replaces values with invalid types",
      () => {
        expect(
          normalizeCanalSettings(
            {
              defaultSceneVisibility:
                "public",
              showListeningActivity:
                false,
              collaborationInvites:
                "yes",
              activityNotifications:
                false,
              autoplayPreviews:
                true,
              personalizedDiscover:
                0,
            },
          ),
        ).toEqual({
          defaultSceneVisibility:
            "public",
          showListeningActivity:
            false,
          collaborationInvites:
            DEFAULT_CANAL_SETTINGS
              .collaborationInvites,
          activityNotifications:
            false,
          autoplayPreviews:
            true,
          personalizedDiscover:
            DEFAULT_CANAL_SETTINGS
              .personalizedDiscover,
        });
      },
    );
  },
);
