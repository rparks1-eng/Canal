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

const CREATOR_SOURCE =
  readFileSync(
    resolve(
      __dirname,
      "..",
      "app",
      "creator",
      "[userId].tsx",
    ),
    "utf8",
  );

const BLOCKED_USERS_SOURCE =
  readFileSync(
    resolve(
      __dirname,
      "..",
      "app",
      "blocked-users.tsx",
    ),
    "utf8",
  );

describe(
  "durable relationship block UI",
  () => {
    it(
      "matches and mutates creator blocks with the immutable profile ID",
      () => {
        expect(
          CREATOR_SOURCE,
        ).toContain(
          "readBlockedUserReferences",
        );

        expect(
          CREATOR_SOURCE,
        ).toMatch(
          /references[.]find[(][\s\S]*reference[\s\S]*[.]targetUserId ===[\s\S]*userId[\s\S]*setBlockedReference[(]\s*matchingReference/u,
        );

        expect(
          CREATOR_SOURCE,
        ).toMatch(
          /await blockUser[(]\s*normalizedHandle,\s*targetDisplayName,\s*profile[.]id,\s*[)]/u,
        );

        expect(
          CREATOR_SOURCE,
        ).toMatch(
          /await unblockUser[(]\s*normalizedHandle,\s*targetDisplayName,\s*profile[.]id,\s*[)]/u,
        );

        expect(
          CREATOR_SOURCE,
        ).toMatch(
          /await unblockUser[(]\s*normalizedHandle,\s*targetDisplayName,\s*stableTargetUserId,\s*[)]/u,
        );
      },
    );

    it(
      "makes the creator actions accessible, confirmed, and mutually exclusive",
      () => {
        expect(
          CREATOR_SOURCE,
        ).toContain(
          "accessibilityLabel={`Block ${profile.displayName}`}",
        );

        expect(
          CREATOR_SOURCE,
        ).toContain(
          "accessibilityLabel={`Unblock ${profile.displayName}`}",
        );

        expect(
          CREATOR_SOURCE,
        ).toMatch(
          /accessibilityState=\{\{[\s\S]*busy:[\s\S]*blockBusy,[\s\S]*disabled:[\s\S]*relationshipBusy/u,
        );

        expect(
          CREATOR_SOURCE,
        ).toMatch(
          /style:[\s\S]*nextBlocked[\s\S]*[?]\s*"destructive"\s*:\s*"default"/u,
        );

        expect(
          CREATOR_SOURCE,
        ).toMatch(
          /isBlocked [?] \([\s\S]*Unblock Creator[\s\S]*[)] : \([\s\S]*Follow Creator[\s\S]*Block Creator/u,
        );

        expect(
          CREATOR_SOURCE,
        ).toContain(
          "accessibilityLabel={`Unblock @${blockedReference.username}`}",
        );

        expect(
          CREATOR_SOURCE,
        ).toMatch(
          /reference[.]targetUserId !==[\s\S]*userId[\s\S]*confirmBlockedReferenceUnblock/u,
        );
      },
    );

    it(
      "fails closed during refresh and clears hidden creator content after blocking",
      () => {
        expect(
          CREATOR_SOURCE,
        ).toMatch(
          /blockStateResolved &&\s*!isBlocked [?] \([\s\S]*Public Snapshots[\s\S]*Scene Collections[\s\S]*Public Scenes/u,
        );

        expect(
          CREATOR_SOURCE,
        ).toMatch(
          /if [(]nextBlocked[)] \{[\s\S]*setScenes[(]\s*\[\],[\s\S]*setSnapshots[(]\s*\[\],[\s\S]*setCollections[(]\s*\[\],/u,
        );

        expect(
          CREATOR_SOURCE,
        ).toMatch(
          /relationshipVersion !==[\s\S]*relationshipVersionRef[.]current/u,
        );
      },
    );

    it(
      "keeps blocked-list identity and unblock filtering UUID-bound",
      () => {
        expect(
          BLOCKED_USERS_SOURCE,
        ).toContain(
          "readBlockedUserReferences",
        );

        expect(
          BLOCKED_USERS_SOURCE,
        ).toMatch(
          /reference:[\s\S]*BlockedUserReference/u,
        );

        expect(
          BLOCKED_USERS_SOURCE,
        ).toMatch(
          /await unblockUser[(]\s*user[.]username,\s*user[.]displayName,\s*targetUserId,\s*[)]/u,
        );

        expect(
          BLOCKED_USERS_SOURCE,
        ).toMatch(
          /operationKey ===[\s\S]*item[.]identity/u,
        );

        expect(
          BLOCKED_USERS_SOURCE,
        ).toMatch(
          /candidate[\s\S]*[.]identity !==[\s\S]*item[.]identity/u,
        );

        expect(
          BLOCKED_USERS_SOURCE,
        ).toContain(
          "key={\n                      item.identity",
        );
      },
    );

    it(
      "permits username identity only for the unconfigured local mock",
      () => {
        expect(
          BLOCKED_USERS_SOURCE,
        ).not.toContain(
          "readBlockedUsers",
        );

        expect(
          BLOCKED_USERS_SOURCE,
        ).toMatch(
          /if [(]targetUserId[)] \{[\s\S]*return `uuid:\$\{targetUserId\}`/u,
        );

        expect(
          BLOCKED_USERS_SOURCE,
        ).toMatch(
          /if \(\s*!isSupabaseConfigured\s*\) \{[\s\S]*return `local-username:\$\{reference[.]username\}`/u,
        );

        expect(
          BLOCKED_USERS_SOURCE,
        ).toMatch(
          /isSupabaseConfigured &&\s*!targetUserId[\s\S]*Unable to unblock safely/u,
        );

        expect(
          BLOCKED_USERS_SOURCE,
        ).toContain(
          "accessibilityLabel={`Unblock ${user.displayName}`}",
        );
      },
    );
  },
);
