import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  contributorConsentLabel,
  createCreatorReleaseMutationLeaseGate,
  creatorReleaseRoleCopy,
  creatorReleaseViewerRole,
  creatorReleaseVoteCopy,
  creatorReleaseVotePercent,
  filterCreatorReleases,
  rankCreatorReleaseResults,
  shouldDiscardCreatorReleaseSnapshot,
} from "../lib/creator-release-interface";

import type {
  CreatorRelease,
  CreatorReleaseDetail,
  CreatorReleaseResultItem,
} from "../lib/creator-releases";

const OWNER_ID =
  "00000000-0000-4000-8000-000000000101";

const LISTENER_ID =
  "00000000-0000-4000-8000-000000000102";

function release(
  id: string,
  status:
    CreatorRelease["status"],
): CreatorRelease {
  return {
    id,
    ownerId:
      OWNER_ID,
    collectionId:
      "00000000-0000-4000-8000-000000000201",
    title:
      "Night Current",
    description:
      "A focused release.",
    status,
    openedAt:
      status === "draft"
        ? null
        : "2026-07-29T01:00:00.000Z",
    closedAt:
      status === "closed"
        ? "2026-07-29T02:00:00.000Z"
        : null,
    winnerSceneId:
      status === "closed"
        ? "scene-b"
        : null,
    createdAt:
      "2026-07-29T00:00:00.000Z",
    updatedAt:
      "2026-07-29T02:00:00.000Z",
  };
}

function detail(
  status:
    CreatorRelease["status"],
  viewerContributorStatus:
    CreatorReleaseDetail[
      "viewerContributorStatus"
    ] = null,
): CreatorReleaseDetail {
  return {
    ...release(
      "release-a",
      status,
    ),
    itemCount:
      status === "draft"
        ? 0
        : 2,
    items:
      status === "draft"
        ? []
        : [
            {
              releaseId:
                "release-a",
              sceneId:
                "scene-a",
              sceneRevision: 3,
              position: 0,
              title:
                "First Scene",
            },
            {
              releaseId:
                "release-a",
              sceneId:
                "scene-b",
              sceneRevision: 7,
              position: 1,
              title:
                "Second Scene",
            },
          ],
    contributors: [],
    viewerContributorStatus,
    selectedVoteSceneId:
      null,
    results:
      null,
  };
}

describe(
  "Release Ballot interface lifecycle",
  () => {
    it(
      "filters browsing without changing release order or contracts",
      () => {
        const releases = [
          release(
            "draft",
            "draft",
          ),
          release(
            "open",
            "open",
          ),
          release(
            "closed",
            "closed",
          ),
        ];

        expect(
          filterCreatorReleases(
            releases,
            "all",
          ).map(
            (item) =>
              item.id,
          ),
        ).toEqual([
          "draft",
          "open",
          "closed",
        ]);

        expect(
          filterCreatorReleases(
            releases,
            "open",
          ).map(
            (item) =>
              item.id,
          ),
        ).toEqual([
          "open",
        ]);

        expect(
          filterCreatorReleases(
            releases,
            "closed",
          ).map(
            (item) =>
              item.id,
          ),
        ).toEqual([
          "closed",
        ]);
      },
    );

    it(
      "presents owner, contributor, listener, consent, vote, and closed-result states through one lifecycle",
      () => {
        const ownerDraft =
          detail(
            "draft",
          );

        expect(
          creatorReleaseViewerRole(
            ownerDraft,
            OWNER_ID,
          ),
        ).toBe(
          "owner",
        );

        expect(
          creatorReleaseRoleCopy(
            "owner",
            "draft",
          ).detail,
        ).toContain(
          "open voting",
        );

        const contributorOpen =
          detail(
            "open",
            "pending",
          );

        expect(
          creatorReleaseViewerRole(
            contributorOpen,
            LISTENER_ID,
          ),
        ).toBe(
          "contributor",
        );

        expect(
          creatorReleaseRoleCopy(
            "contributor",
            "open",
          ).detail,
        ).toContain(
          "separate choices",
        );

        expect(
          contributorConsentLabel(
            "pending",
          ),
        ).toBe(
          "Response needed",
        );

        expect(
          contributorConsentLabel(
            "accepted",
          ),
        ).toBe(
          "Credit accepted",
        );

        expect(
          creatorReleaseVoteCopy(
            null,
            "scene-a",
          ),
        ).toMatchObject({
          selected: false,
          label: "Choose",
        });

        expect(
          creatorReleaseVoteCopy(
            "scene-a",
            "scene-a",
          ),
        ).toMatchObject({
          selected: true,
          label:
            "Your favorite",
        });

        expect(
          creatorReleaseVoteCopy(
            "scene-a",
            "scene-b",
          ),
        ).toMatchObject({
          selected: false,
          label:
            "Change vote",
        });

        expect(
          creatorReleaseRoleCopy(
            "listener",
            "closed",
          ).detail,
        ).toContain(
          "never displays who voted",
        );

        const results:
          CreatorReleaseResultItem[] = [
            {
              releaseId:
                "release-a",
              sceneId:
                "scene-a",
              sceneRevision: 3,
              position: 0,
              title:
                "First Scene",
              voteCount: 2,
              isWinner: false,
            },
            {
              releaseId:
                "release-a",
              sceneId:
                "scene-b",
              sceneRevision: 7,
              position: 1,
              title:
                "Second Scene",
              voteCount: 3,
              isWinner: true,
            },
          ];

        expect(
          rankCreatorReleaseResults(
            results,
          ).map(
            (item) =>
              item.sceneId,
          ),
        ).toEqual([
          "scene-b",
          "scene-a",
        ]);

        expect(
          creatorReleaseVotePercent(
            3,
            5,
          ),
        ).toBe(
          60,
        );

        expect(
          creatorReleaseVotePercent(
            0,
            0,
          ),
        ).toBe(
          0,
        );
      },
    );

    it(
      "discards snapshots only for privacy-sensitive access changes",
      () => {
        for (
          const kind of [
            "account-changed",
            "blocked",
            "not-found",
            "permission-denied",
          ]
        ) {
          expect(
            shouldDiscardCreatorReleaseSnapshot({
              kind,
            }),
          ).toBe(true);
        }

        for (
          const kind of [
            "offline",
            "request-failed",
            "stale",
          ]
        ) {
          expect(
            shouldDiscardCreatorReleaseSnapshot({
              kind,
            }),
          ).toBe(false);
        }
      },
    );

    it(
      "releases an invalidated mutation after blur without allowing a stale commit",
      () => {
        const gate =
          createCreatorReleaseMutationLeaseGate();

        const lease =
          gate.acquire();

        expect(
          lease,
        ).not.toBeNull();

        if (!lease) {
          throw new Error(
            "Expected a Release Ballot mutation lease.",
          );
        }

        expect(
          gate.canCommit(
            lease,
          ),
        ).toBe(true);

        gate.invalidateCommits();

        expect(
          gate.canCommit(
            lease,
          ),
        ).toBe(false);

        expect(
          gate.release(
            lease,
          ),
        ).toBe(true);

        expect(
          gate.isBusy(),
        ).toBe(false);

        expect(
          gate.acquire(),
        ).not.toBeNull();
      },
    );
  },
);
