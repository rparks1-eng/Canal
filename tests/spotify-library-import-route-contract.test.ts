import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "@jest/globals";

function source(
  relativePath: string,
): string {
  return fs.readFileSync(
    path.join(
      process.cwd(),
      relativePath,
    ),
    "utf8",
  );
}

describe(
  "Spotify Library full-import route contract",
  () => {
    const screen =
      source(
        "app/spotify-library.tsx",
      );

    it(
      "shows source-level progress and explicitly resumable import controls",
      () => {
        expect(screen).toContain(
          "Spotify import progress",
        );
        expect(screen).toContain(
          "Saved tracks",
        );
        expect(screen).toContain(
          "Playlist items",
        );
        expect(screen).toContain(
          'accessibilityLabel="Resume Spotify import"',
        );
        expect(screen).toContain(
          'accessibilityLabel="Pause Spotify import"',
        );
        expect(screen).toMatch(
          /importResumeButton:\s*\{[\s\S]*?minHeight:\s*48,/u,
        );
        expect(screen).toMatch(
          /importPauseButton:\s*\{[\s\S]*?minHeight:\s*48,/u,
        );
        expect(screen).toMatch(
          /backButton:\s*\{[\s\S]*?width:\s*48,[\s\S]*?height:\s*48,/u,
        );
      },
    );

    it(
      "announces one current-account import outcome and moves focus to its visible status",
      () => {
        expect(screen).toContain(
          "type SpotifyLibraryStatusEvent",
        );
        expect(screen).toContain(
          "statusEventAccountIdentity ===",
        );
        expect(screen).toContain(
          "eventAccountIdentity",
        );
        expect(screen).toContain(
          "announcedStatusEventId.current ===",
        );
        expect(screen).toContain(
          'process.env.EXPO_OS ===\n        "ios"',
        );
        expect(screen).toContain(
          "AccessibilityInfo\n          .announceForAccessibility",
        );
        expect(screen).toContain(
          "AccessibilityInfo\n          .setAccessibilityFocus",
        );
        expect(screen).toContain(
          'accessibilityLiveRegion="polite"',
        );
        expect(screen).toContain(
          "Spotify import is paused. Resume will be available in about",
        );
      },
    );

    it(
      "waits out a persisted Spotify retry window with a disabled, truthfully timed resume action",
      () => {
        expect(screen).toContain(
          "getSpotifyLibraryImportRetryAfterSeconds",
        );
        expect(screen).toContain(
          "retryWindowActive",
        );
        expect(screen).toContain(
          "disabled: resumeDisabled",
        );
        expect(screen).toContain(
          "Resume will be available in about",
        );
        expect(screen).toContain(
          "Canal imports items only from playlists you own or collaborate on.",
        );
        expect(screen).not.toContain(
          "Spotify does not allow Canal to read their items.",
        );
      },
    );

    it(
      "derives visible Spotify links from canonical IDs without retaining provider URLs or artwork",
      () => {
        expect(screen).toContain(
          "getSpotifyContentUrl",
        );
        expect(screen).toContain(
          "Open in Spotify",
        );
        expect(screen).not.toContain(
          "external_urls",
        );
        expect(screen).not.toContain(
          "<Image",
        );
      },
    );

    it(
      "keeps busy controls named and imported metadata reflowable at large text sizes",
      () => {
        expect(screen).toContain(
          'accessibilityLabel="Export playlist"',
        );
        expect(screen).toContain(
          "accessibilityState={{",
        );
        expect(screen).not.toContain(
          "numberOfLines={1}",
        );

        for (
          const styleName of [
            "rowSubtitle",
            "successText",
            "warningText",
            "importText",
            "importWarning",
          ]
        ) {
          expect(screen).not.toMatch(
            new RegExp(
              `${styleName}:\\s*\\{[^}]*lineHeight:`,
              "u",
            ),
          );
        }
      },
    );

    it(
      "fences rendered snapshots and importer callbacks by account epoch",
      () => {
        expect(screen).toContain(
          "accountEpoch",
        );
        expect(screen).toContain(
          "snapshotAccountIdentity === accountIdentity",
        );
        expect(screen).toContain(
          "importProgressAccountIdentity ===",
        );
        expect(screen).toContain(
          "operationCommitGuard",
        );
        expect(screen).toContain(
          "importOperationRef.current ===",
        );
        expect(screen).not.toContain(
          "useReconnectReload",
        );
      },
    );
  },
);
