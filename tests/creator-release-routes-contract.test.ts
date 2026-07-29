import {
  describe,
  expect,
  it,
} from "@jest/globals";

import fs from "node:fs";
import path from "node:path";

import {
  createDetailMutationLeaseGate,
  detailSnapshotMutationIsBlocked,
} from "../app/releases/[releaseId]";

import {
  creationSnapshotMutationIsBlocked,
} from "../app/releases/new";

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
  "Creator Release Ballot route contract",
  () => {
    const listRoute =
      source(
        "app/releases/index.tsx",
      );

    const newRoute =
      source(
        "app/releases/new.tsx",
      );

    const detailRoute =
      source(
        "app/releases/[releaseId].tsx",
      );

    const card =
      source(
        "components/CreatorReleaseCard.tsx",
      );

    const allRouteSources = [
      listRoute,
      newRoute,
      detailRoute,
      card,
    ].join(
      "\n",
    );

    it(
      "provides list, create, and dynamic detail paths through the shared release card",
      () => {
        expect(
          fs.existsSync(
            path.join(
              process.cwd(),
              "app/releases/index.tsx",
            ),
          ),
        ).toBe(true);

        expect(
          fs.existsSync(
            path.join(
              process.cwd(),
              "app/releases/new.tsx",
            ),
          ),
        ).toBe(true);

        expect(
          fs.existsSync(
            path.join(
              process.cwd(),
              "app/releases/[releaseId].tsx",
            ),
          ),
        ).toBe(true);

        expect(
          listRoute,
        ).toContain(
          '"/releases/new"',
        );

        expect(
          card,
        ).toContain(
          '"/releases/[releaseId]"',
        );

        expect(
          card,
        ).toMatch(
          /releaseId:[\s\S]*release[.]id/,
        );

        expect(
          newRoute,
        ).toContain(
          '"/releases/[releaseId]"',
        );

        expect(
          newRoute,
        ).toMatch(
          /router[.]replace[(]\{[\s\S]*releaseId:[\s\S]*release[.]id/,
        );

        expect(
          listRoute,
        ).toContain(
          "CreatorReleaseCard",
        );
      },
    );

    it(
      "lists owned releases and accessible ballots with explicit loading and empty creation states",
      () => {
        expect(
          listRoute,
        ).toMatch(
          /release[.]ownerId ===[\s\S]*props[.]expectedUserId/,
        );

        expect(
          listRoute,
        ).toMatch(
          /release[.]ownerId !==[\s\S]*props[.]expectedUserId/,
        );

        expect(
          listRoute,
        ).toContain(
          "Your releases",
        );

        expect(
          listRoute,
        ).toContain(
          "Ballots you can access",
        );

        expect(
          listRoute,
        ).toContain(
          "Loading release ballots",
        );

        expect(
          listRoute,
        ).toContain(
          "No releases yet",
        );

        expect(
          listRoute,
        ).toContain(
          "New Release",
        );
      },
    );

    it(
      "preselects only an owned public non-empty Scene collection and creates a bounded draft",
      () => {
        expect(
          newRoute,
        ).toContain(
          "listOwnSceneCollections",
        );

        expect(
          newRoute,
        ).toMatch(
          /listOwnSceneCollections[(]\{[\s\S]*account,[\s\S]*\}[)]/,
        );

        expect(
          newRoute,
        ).toContain(
          "requestedCollectionId",
        );

        expect(
          newRoute,
        ).toMatch(
          /collection[.]isPublic &&[\s\S]*collection[.]sceneCount >[\s\S]*0/,
        );

        expect(
          newRoute,
        ).toContain(
          "Draft collection",
        );

        expect(
          newRoute,
        ).toContain(
          "Empty collection",
        );

        expect(
          newRoute,
        ).toMatch(
          /MAX_TITLE_LENGTH\s*=\s*80/,
        );

        expect(
          newRoute,
        ).toMatch(
          /MAX_DESCRIPTION_LENGTH\s*=\s*500/,
        );

        expect(
          newRoute,
        ).toMatch(
          /createCreatorRelease[(][\s\S]*collectionId:[\s\S]*selectedCollection[.]id[\s\S]*title:[\s\S]*normalizedTitle[\s\S]*description:[\s\S]*normalizedDescription[\s\S]*account/,
        );

        expect(
          newRoute,
        ).toContain(
          "Creating this draft does not open voting",
        );
      },
    );

    it(
      "guards delayed reads and every mutation by account, route, epoch, and execution-time connectivity",
      () => {
        for (
          const route of [
            listRoute,
            newRoute,
            detailRoute,
          ]
        ) {
          expect(
            route,
          ).toContain(
            "captureCreatorReleaseAccount",
          );

          expect(
            route,
          ).toContain(
            "requestEpoch",
          );

          expect(
            route,
          ).toContain(
            "activeUserIdRef",
          );

          expect(
            route,
          ).toContain(
            "useReconnectReload",
          );

          expect(
            route,
          ).toContain(
            "RecoveryNotice",
          );
        }

        expect(
          newRoute,
        ).toMatch(
          /const createRelease[\s\S]*connectivityStatus ===[\s\S]*"offline"[\s\S]*captureCreatorReleaseAccount[\s\S]*createCreatorRelease/,
        );

        expect(
          detailRoute,
        ).toMatch(
          /const runMutation[\s\S]*connectivityStatus ===[\s\S]*"offline"[\s\S]*loadError[\s\S]*"stale"[\s\S]*captureCreatorReleaseAccount/,
        );

        expect(
          detailRoute,
        ).toContain(
          "releaseIdRef",
        );

        expect(
          detailRoute,
        ).toContain(
          "mutationLeaseGateRef",
        );
      },
    );

    it(
      "executes the production freshness gates for creation and detail mutations",
      () => {
        for (
          const gate of [
            creationSnapshotMutationIsBlocked,
            detailSnapshotMutationIsBlocked,
          ]
        ) {
          expect(
            gate({
              loadInFlight:
                true,
              isLoading:
                false,
              hasFreshSnapshot:
                true,
            }),
          ).toBe(true);

          expect(
            gate({
              loadInFlight:
                false,
              isLoading:
                true,
              hasFreshSnapshot:
                true,
            }),
          ).toBe(true);

          expect(
            gate({
              loadInFlight:
                false,
              isLoading:
                false,
              hasFreshSnapshot:
                false,
            }),
          ).toBe(true);

          expect(
            gate({
              loadInFlight:
                false,
              isLoading:
                false,
              hasFreshSnapshot:
                true,
            }),
          ).toBe(false);
        }

        expect(
          newRoute,
        ).toMatch(
          /const createRelease[\s\S]*snapshotMutationIsBlocked[(][)][\s\S]*const createIsDisabled[\s\S]*snapshotMutationIsBlocked[(][)]/,
        );

        expect(
          detailRoute,
        ).toMatch(
          /const runMutation[\s\S]*snapshotMutationIsBlocked[(][)][\s\S]*const actionsBlocked[\s\S]*snapshotMutationIsBlocked[(][)]/,
        );
      },
    );

    it(
      "executes the production lease through blur invalidation, settlement, and refocus",
      () => {
        const gate =
          createDetailMutationLeaseGate();

        const blurredAttempt =
          gate.acquire();

        expect(
          blurredAttempt,
        ).not.toBeNull();

        if (
          !blurredAttempt
        ) {
          throw new Error(
            "Expected the detail mutation lease.",
          );
        }

        expect(
          gate.isBusy(),
        ).toBe(true);

        expect(
          gate.canCommit(
            blurredAttempt,
          ),
        ).toBe(true);

        gate.invalidateCommits();

        expect(
          gate.canCommit(
            blurredAttempt,
          ),
        ).toBe(false);

        expect(
          gate.isBusy(),
        ).toBe(true);

        expect(
          gate.release(
            blurredAttempt,
          ),
        ).toBe(true);

        expect(
          gate.isBusy(),
        ).toBe(false);

        const refocusedAttempt =
          gate.acquire();

        expect(
          refocusedAttempt,
        ).not.toBeNull();

        if (
          !refocusedAttempt
        ) {
          throw new Error(
            "Expected a new lease after refocus.",
          );
        }

        expect(
          gate.canCommit(
            refocusedAttempt,
          ),
        ).toBe(true);

        expect(
          gate.release(
            blurredAttempt,
          ),
        ).toBe(false);

        expect(
          gate.isBusy(),
        ).toBe(true);

        expect(
          gate.release(
            refocusedAttempt,
          ),
        ).toBe(true);

        expect(
          gate.isBusy(),
        ).toBe(false);

        expect(
          detailRoute,
        ).toMatch(
          /invalidateCommits[(][)][\s\S]*commitWasInvalidated[\s\S]*release[(][\s\S]*lease[\s\S]*setBusyAction/,
        );
      },
    );

    it(
      "keeps owner actions separate and rejects owner voting inside the handler",
      () => {
        expect(
          detailRoute,
        ).toMatch(
          /const openRelease[\s\S]*release[.]ownerId !==[\s\S]*props[.]expectedUserId[\s\S]*release[.]status !==[\s\S]*"draft"[\s\S]*openCreatorRelease/,
        );

        expect(
          detailRoute,
        ).toMatch(
          /const closeRelease[\s\S]*release[.]ownerId !==[\s\S]*props[.]expectedUserId[\s\S]*release[.]status !==[\s\S]*"open"[\s\S]*closeCreatorRelease/,
        );

        expect(
          detailRoute,
        ).toMatch(
          /const castVote[\s\S]*release[.]status !==[\s\S]*"open"[\s\S]*release[.]ownerId ===[\s\S]*props[.]expectedUserId[\s\S]*castCreatorReleaseVote/,
        );

        expect(
          detailRoute,
        ).toContain(
          "Open voting and freeze Scenes",
        );

        expect(
          detailRoute,
        ).toContain(
          "Close voting and reveal final totals",
        );
      },
    );

    it(
      "shows frozen ordered revisions, one selected favorite, and contributor consent without exposing non-consenting profiles",
      () => {
        expect(
          detailRoute,
        ).toMatch(
          /release[.]items[.]map[\s\S]*item[.]position[\s\S]*item[.]sceneRevision/,
        );

        expect(
          detailRoute,
        ).toContain(
          "selectedVoteSceneId",
        );

        expect(
          detailRoute,
        ).toContain(
          "creatorReleaseVoteCopy",
        );

        expect(
          detailRoute,
        ).toContain(
          "respondCreatorReleaseCredit",
        );

        expect(
          detailRoute,
        ).toMatch(
          /const respondToCredit[\s\S]*release[.]status !==[\s\S]*"open"[\s\S]*viewerContributorStatus ===[\s\S]*null/,
        );

        expect(
          detailRoute,
        ).toMatch(
          /release[.]status ===[\s\S]*"open" \? [(][\s\S]*Accept public contributor credit[\s\S]*Decline public contributor credit[\s\S]*[)] : null/,
        );

        expect(
          detailRoute,
        ).toContain(
          "Contributor credit is closed.",
        );

        expect(
          detailRoute,
        ).toContain(
          "Accept public contributor credit",
        );

        expect(
          detailRoute,
        ).toContain(
          "Decline public contributor credit",
        );

        expect(
          detailRoute,
        ).toMatch(
          /acceptedContributors[\s\S]*contributor[.]status ===[\s\S]*"accepted"/,
        );

        const acceptedFilterStart =
          detailRoute.indexOf(
            "const acceptedContributors",
          );

        const acceptedListStart =
          detailRoute.indexOf(
            "acceptedContributors.map",
          );

        expect(
          acceptedListStart,
        ).toBeGreaterThan(-1);

        expect(
          detailRoute.slice(
            acceptedFilterStart,
            acceptedListStart,
          ),
        ).not.toMatch(
          /profile !==[\s\S]*null/,
        );

        expect(
          detailRoute.slice(
            acceptedListStart,
          ),
        ).toContain(
          "contributor.profile",
        );

        expect(
          detailRoute.slice(
            acceptedListStart,
          ),
        ).toContain(
          '"/creator/[userId]"',
        );

        expect(
          detailRoute.slice(
            acceptedListStart,
          ),
        ).toMatch(
          /userId:[\s\S]*contributor[.]contributorId/,
        );
      },
    );

    it(
      "renders aggregate totals and winners only inside the closed results branch",
      () => {
        const closedBranchStart =
          detailRoute.indexOf(
            'release.status ===\n                "closed" &&',
          );

        const firstTotal =
          detailRoute.indexOf(
            "release.results.totalVotes",
          );

        const firstItemCount =
          detailRoute.indexOf(
            "item.voteCount",
          );

        expect(
          closedBranchStart,
        ).toBeGreaterThan(-1);

        expect(
          firstTotal,
        ).toBeGreaterThan(
          closedBranchStart,
        );

        expect(
          firstItemCount,
        ).toBeGreaterThan(
          closedBranchStart,
        );

        expect(
          detailRoute.slice(
            0,
            closedBranchStart,
          ),
        ).not.toMatch(
          /[.]totalVotes|[.]voteCount|[.]winnerSceneIds/,
        );

        expect(
          detailRoute,
        ).toContain(
          "Results are sealed",
        );

        expect(
          detailRoute,
        ).not.toMatch(
          /\bvoterId\b|\bvoter_id\b|creator_release_votes/,
        );
      },
    );

    it(
      "distinguishes offline, stale, changed-account, blocked, and inaccessible recovery states",
      () => {
        expect(
          allRouteSources,
        ).toContain(
          "Account changed",
        );

        expect(
          allRouteSources,
        ).toContain(
          '"blocked"',
        );

        expect(
          detailRoute,
        ).toContain(
          "Release changed",
        );

        expect(
          detailRoute,
        ).toContain(
          "Release inaccessible",
        );

        expect(
          detailRoute,
        ).toContain(
          "The release ID is missing.",
        );

        expect(
          detailRoute,
        ).toContain(
          "Showing the last loaded release",
        );

        expect(
          allRouteSources,
        ).toContain(
          "Canal did not queue",
        );
      },
    );

    it(
      "polishes browse roles and preserves lifecycle recovery without stale mutations",
      () => {
        expect(
          listRoute,
        ).toContain(
          "CREATOR_RELEASE_BROWSE_FILTERS",
        );

        expect(
          listRoute,
        ).toContain(
          "filterCreatorReleases",
        );

        expect(
          listRoute,
        ).toContain(
          "Nothing in this view",
        );

        expect(
          detailRoute,
        ).toContain(
          "creatorReleaseViewerRole",
        );

        expect(
          detailRoute,
        ).toContain(
          "contributorConsentLabel",
        );

        expect(
          detailRoute,
        ).toContain(
          "rankCreatorReleaseResults",
        );

        for (
          const route of [
            listRoute,
            newRoute,
            detailRoute,
          ]
        ) {
          expect(
            route,
          ).toContain(
            "shouldDiscardCreatorReleaseSnapshot",
          );

          expect(
            route,
          ).toContain(
            "Refreshing",
          );
        }

        expect(
          newRoute,
        ).toContain(
          "createCreatorReleaseMutationLeaseGate",
        );

        expect(
          newRoute,
        ).toContain(
          "Draft created while you were away",
        );

        expect(
          newRoute,
        ).toContain(
          "restoredDraftId",
        );
      },
    );

    it(
      "uses accessible responsive controls, live feedback, and tabular result counts",
      () => {
        for (
          const route of [
            listRoute,
            newRoute,
            detailRoute,
          ]
        ) {
          expect(
            route,
          ).toContain(
            'contentInsetAdjustmentBehavior="automatic"',
          );

          expect(
            route,
          ).toContain(
            "maxWidth: 720",
          );

          expect(
            route,
          ).toContain(
            "accessibilityLiveRegion",
          );

          expect(
            route,
          ).toContain(
            "selectable",
          );
        }

        expect(
          newRoute,
        ).toContain(
          'accessibilityRole="radiogroup"',
        );

        expect(
          detailRoute,
        ).toContain(
          '"tabular-nums"',
        );

        expect(
          detailRoute,
        ).toMatch(
          /accessibilityState=\{\{[\s\S]*busy:[\s\S]*disabled:/,
        );

        expect(
          listRoute,
        ).toContain(
          'accessibilityRole="radiogroup"',
        );

        expect(
          card,
        ).toContain(
          "accessibilityHint",
        );

        expect(
          card,
        ).toContain(
          "AVAILABLE TO YOU",
        );

        expect(
          card,
        ).not.toContain(
          '"LISTENER"',
        );

        expect(
          listRoute,
        ).toMatch(
          /filterButton:\s*\{[\s\S]*?minHeight:\s*48,/,
        );

        expect(
          allRouteSources,
        ).toContain(
          "hitSlop",
        );
      },
    );

    it(
      "does not introduce out-of-scope release features",
      () => {
        expect(
          allRouteSources,
        ).not.toMatch(
          /anonymous voting|comments?[/_-]?chat|notifications?|realtime|schedule(d|ing)?|payments?|licensing|provider playback|admin moderation/i,
        );
      },
    );
  },
);
