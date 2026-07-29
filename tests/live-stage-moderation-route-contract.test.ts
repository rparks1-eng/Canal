import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";

const LIVE_STAGE_ROUTE =
  readFileSync(
    resolve(
      process.cwd(),
      "app/live-stage/[stageId].tsx",
    ),
    "utf8",
  );

const COMPACT_ROUTE =
  LIVE_STAGE_ROUTE.replace(
    /\s+/gu,
    " ",
  );

function sourceBetween(
  start: string,
  end: string,
): string {
  const startIndex =
    COMPACT_ROUTE.indexOf(
      start,
    );
  const endIndex =
    COMPACT_ROUTE.indexOf(
      end,
      startIndex,
    );

  expect(
    startIndex,
  ).toBeGreaterThanOrEqual(
    0,
  );
  expect(
    endIndex,
  ).toBeGreaterThan(
    startIndex,
  );

  return COMPACT_ROUTE.slice(
    startIndex,
    endIndex,
  );
}

describe(
  "Live Stage moderation route",
  () => {
    it(
      "offers non-authors a bounded, confirmed report flow even after the Stage ends",
      () => {
        expect(
          LIVE_STAGE_ROUTE,
        ).toContain(
          "reportLiveStageMessage",
        );
        expect(
          LIVE_STAGE_ROUTE,
        ).toContain(
          "type LiveStageReportReason",
        );

        for (
          const reason of [
            '"spam"',
            '"harassment"',
            '"unsafe_content"',
            '"other"',
          ]
        ) {
          expect(
            LIVE_STAGE_ROUTE,
          ).toContain(
            reason,
          );
        }

        expect(
          COMPACT_ROUTE,
        ).toContain(
          "canReport={ !item.isMine }",
        );
        expect(
          LIVE_STAGE_ROUTE,
        ).toContain(
          'accessibilityRole="radio"',
        );
        expect(
          LIVE_STAGE_ROUTE,
        ).toContain(
          'accessibilityLabel={`Report reason: ${reason.label}`}',
        );
        expect(
          LIVE_STAGE_ROUTE,
        ).toContain(
          '"Report this message?"',
        );
        expect(
          LIVE_STAGE_ROUTE,
        ).toContain(
          '"Report message"',
        );

        const openReport =
          sourceBetween(
            "function openReportMessage(",
            "function closeReportMessage(",
          );
        const confirmReport =
          sourceBetween(
            "function confirmReportMessage(",
            "function confirmRemoveMessage(",
          );

        expect(
          openReport,
        ).toContain(
          "message.isMine",
        );
        expect(
          openReport,
        ).toContain(
          "cloudIsOffline",
        );
        expect(
          openReport,
        ).not.toContain(
          "isEnded",
        );
        expect(
          confirmReport,
        ).not.toContain(
          "isEnded",
        );
        expect(
          confirmReport,
        ).toContain(
          "reportLiveStageMessage(",
        );
        expect(
          confirmReport,
        ).toContain(
          "true,",
        );
      },
    );

    it(
      "lets the host remove only non-host messages with named accessible controls",
      () => {
        expect(
          COMPACT_ROUTE,
        ).toContain(
          "const messageIsFromHost = stage.hostId",
        );
        expect(
          COMPACT_ROUTE,
        ).toContain(
          "canRemove={ isHost && !messageIsFromHost }",
        );
        expect(
          LIVE_STAGE_ROUTE,
        ).toContain(
          "moderateLiveStageMessage",
        );
        expect(
          LIVE_STAGE_ROUTE,
        ).toContain(
          'accessibilityLabel={`Remove message from ${props.message.displayName}`}',
        );
        expect(
          LIVE_STAGE_ROUTE,
        ).toContain(
          '"Remove this message?"',
        );
        expect(
          LIVE_STAGE_ROUTE,
        ).toContain(
          '"Remove message"',
        );
      },
    );

    it(
      "keeps profile navigation separate from confirmed host member controls",
      () => {
        expect(
          LIVE_STAGE_ROUTE,
        ).toContain(
          "moderateLiveStageMember",
        );
        expect(
          COMPACT_ROUTE,
        ).toContain(
          'participant.role !== "host"',
        );
        expect(
          LIVE_STAGE_ROUTE,
        ).toContain(
          'accessibilityLabel={`View ${participant.displayName}\'s profile`}',
        );
        expect(
          LIVE_STAGE_ROUTE,
        ).toContain(
          "/creator/[userId]",
        );
        expect(
          LIVE_STAGE_ROUTE,
        ).toContain(
          "/friend/[username]",
        );
        expect(
          COMPACT_ROUTE,
        ).toContain(
          "if ( participant.userId )",
        );
        expect(
          LIVE_STAGE_ROUTE,
        ).toContain(
          'accessibilityLabel={`View ${stage.hostName}\'s creator profile`}',
        );
        expect(
          LIVE_STAGE_ROUTE,
        ).toContain(
          'accessibilityLabel={`${roleActionLabel} ${participant.displayName} to ${roleAction === "promote" ? "collaborator" : "listener"}`}',
        );
        expect(
          LIVE_STAGE_ROUTE,
        ).toContain(
          'accessibilityLabel={`Remove ${participant.displayName} from Stage`}',
        );
        expect(
          LIVE_STAGE_ROUTE,
        ).toContain(
          "They will not be able to rejoin this Stage.",
        );
        expect(
          LIVE_STAGE_ROUTE,
        ).toContain(
          "was removed and cannot rejoin this Stage.",
        );
        expect(
          LIVE_STAGE_ROUTE,
        ).not.toMatch(
          /<Pressable\s+key=\{\s*participant/gu,
        );
      },
    );

    it(
      "guards mutations while busy, offline, or ended without blocking ended-message reports",
      () => {
        const moderation =
          sourceBetween(
            "async function performModeration(",
            "function openReportMessage(",
          );
        const memberAction =
          sourceBetween(
            "function confirmMemberAction(",
            "async function shareStage(",
          );

        expect(
          moderation,
        ).toContain(
          "moderationRef.current",
        );
        expect(
          moderation,
        ).toContain(
          "cloudIsOffline",
        );
        expect(
          moderation,
        ).toContain(
          "isEnded && !allowEnded",
        );
        expect(
          memberAction,
        ).toContain(
          "!isHost",
        );
        expect(
          memberAction,
        ).toContain(
          "!participant.userId",
        );
        expect(
          memberAction,
        ).toContain(
          "participant.role === \"host\"",
        );
        expect(
          memberAction,
        ).toContain(
          "cloudIsOffline",
        );
        expect(
          memberAction,
        ).toContain(
          "isEnded",
        );
        expect(
          COMPACT_ROUTE,
        ).toContain(
          "const moderationDisabled = Boolean( moderatingTarget, ) || cloudIsOffline || isEnded",
        );
        expect(
          COMPACT_ROUTE,
        ).toContain(
          "const reportDisabled = Boolean( moderatingTarget, ) || cloudIsOffline",
        );
      },
    );

    it(
      "reloads after successful actions and routes failures through recovery feedback",
      () => {
        const moderation =
          sourceBetween(
            "async function performModeration(",
            "function openReportMessage(",
          );
        const advanceTrack =
          sourceBetween(
            "async function advanceTrack()",
            "function confirmEndStage()",
          );
        const finishStage =
          sourceBetween(
            "async function finishStage()",
            "async function sendMessage()",
          );

        expect(
          moderation.indexOf(
            "await operation(",
          ),
        ).toBeGreaterThanOrEqual(
          0,
        );
        expect(
          moderation.lastIndexOf(
            "setModerationFeedback(",
          ),
        ).toBeGreaterThan(
          moderation.indexOf(
            "await operation(",
          ),
        );
        expect(
          moderation.indexOf(
            "await loadRoom();",
          ),
        ).toBeGreaterThan(
          moderation.lastIndexOf(
            "setModerationFeedback(",
          ),
        );
        expect(
          moderation,
        ).toContain(
          "setError(",
        );
        expect(
          advanceTrack,
        ).toMatch(
          /await advanceLiveStageTrack[\s\S]*setError\(""\)/u,
        );
        expect(
          finishStage,
        ).toMatch(
          /await endLiveStage[\s\S]*setError\(""\)/u,
        );
        expect(
          LIVE_STAGE_ROUTE,
        ).toContain(
          'accessibilityLiveRegion="polite"',
        );
        expect(
          COMPACT_ROUTE,
        ).toContain(
          "capturingSnapshot || Boolean( moderatingTarget, )",
        );
        expect(
          LIVE_STAGE_ROUTE,
        ).toContain(
          "<RecoveryNotice",
        );
      },
    );
  },
);
