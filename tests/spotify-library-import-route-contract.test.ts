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
        expect(screen).toContain(
          'accessibilityLiveRegion="polite"',
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
