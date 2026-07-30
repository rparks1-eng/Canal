import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  createEventRunSheetMutationLeaseGate,
  eventRunSheetMutationIsBlocked,
  eventRunSheetRequestCanCommit,
  eventRunSheetStatusCopy,
  filterEventRunSheets,
  shouldDiscardEventRunSheetSnapshot,
} from "../lib/event-run-sheet-interface";

import type {
  EventRunSheet,
} from "../lib/event-run-sheets";

const OWNER_ID =
  "00000000-0000-4000-8000-000000000101";

const NEXT_USER_ID =
  "00000000-0000-4000-8000-000000000102";

function runSheet(
  id: string,
  status:
    EventRunSheet["status"],
): EventRunSheet {
  return {
    id,
    ownerId:
      OWNER_ID,
    collectionId:
      "00000000-0000-4000-8000-000000000201",
    title:
      "Night Current",
    venueLabel:
      "Canal Hall",
    startsAt:
      "2026-08-01T23:00:00.000Z",
    timeZone:
      "America/New_York",
    activePosition:
      0,
    status,
    version:
      2,
    startedAt:
      status ===
        "planned"
        ? null
        : "2026-08-01T23:05:00.000Z",
    completedAt:
      status ===
        "completed"
        ? "2026-08-02T00:00:00.000Z"
        : null,
    sourceCollectionTitle:
      status ===
        "planned"
        ? null
        : "Dinner flow",
    createdAt:
      "2026-07-29T00:00:00.000Z",
    updatedAt:
      "2026-07-29T02:00:00.000Z",
  };
}

describe(
  "Event Run Sheet lifecycle interface guards",
  () => {
    it(
      "rejects delayed snapshots after an account, route, or request switch",
      () => {
        const current = {
          expectedUserId:
            OWNER_ID,
          expectedAccountEpoch:
            7,
          activeUserId:
            OWNER_ID,
          activeAccountEpoch:
            7,
          accountUserId:
            OWNER_ID,
          accountEpoch:
            7,
          requestEpoch:
            4,
          activeRequestEpoch:
            4,
          expectedRunSheetId:
            "sheet-a",
          activeRunSheetId:
            "sheet-a",
        };

        expect(
          eventRunSheetRequestCanCommit(
            current,
          ),
        ).toBe(
          true,
        );

        expect(
          eventRunSheetRequestCanCommit({
            ...current,
            activeUserId:
              NEXT_USER_ID,
          }),
        ).toBe(
          false,
        );

        expect(
          eventRunSheetRequestCanCommit({
            ...current,
            activeAccountEpoch:
              8,
          }),
        ).toBe(
          false,
        );

        expect(
          eventRunSheetRequestCanCommit({
            ...current,
            accountEpoch:
              8,
          }),
        ).toBe(
          false,
        );

        expect(
          eventRunSheetRequestCanCommit({
            ...current,
            activeRequestEpoch:
              5,
          }),
        ).toBe(
          false,
        );

        expect(
          eventRunSheetRequestCanCommit({
            ...current,
            activeRunSheetId:
              "sheet-b",
          }),
        ).toBe(
          false,
        );
      },
    );

    it(
      "blocks every mutation while loading, stale, offline, or busy",
      () => {
        expect(
          eventRunSheetMutationIsBlocked({
            isLoading:
              false,
            hasFreshSnapshot:
              true,
            isOffline:
              false,
            isBusy:
              false,
          }),
        ).toBe(
          false,
        );

        for (
          const override of [
            {
              isLoading:
                true,
            },
            {
              hasFreshSnapshot:
                false,
            },
            {
              isOffline:
                true,
            },
            {
              isBusy:
                true,
            },
          ]
        ) {
          expect(
            eventRunSheetMutationIsBlocked({
              isLoading:
                false,
              hasFreshSnapshot:
                true,
              isOffline:
                false,
              isBusy:
                false,
              ...override,
            }),
          ).toBe(
            true,
          );
        }
      },
    );

    it(
      "releases a blurred in-flight mutation without allowing its stale commit",
      () => {
        const gate =
          createEventRunSheetMutationLeaseGate();

        const lease =
          gate.acquire();

        expect(
          lease,
        ).not.toBeNull();
        expect(
          gate.isBusy(),
        ).toBe(
          true,
        );

        gate.invalidateCommits();

        expect(
          gate.canCommit(
            lease!,
          ),
        ).toBe(
          false,
        );
        expect(
          gate.release(
            lease!,
          ),
        ).toBe(
          true,
        );
        expect(
          gate.isBusy(),
        ).toBe(
          false,
        );
        expect(
          gate.acquire(),
        ).not.toBeNull();
      },
    );

    it(
      "filters lifecycle states and describes immutable boundaries",
      () => {
        const runSheets = [
          runSheet(
            "planned",
            "planned",
          ),
          runSheet(
            "running",
            "running",
          ),
          runSheet(
            "completed",
            "completed",
          ),
        ];

        expect(
          filterEventRunSheets(
            runSheets,
            "running",
          ).map(
            (item) =>
              item.id,
          ),
        ).toEqual([
          "running",
        ]);

        expect(
          eventRunSheetStatusCopy(
            "planned",
          ).detail,
        ).toContain(
          "editable",
        );
        expect(
          eventRunSheetStatusCopy(
            "running",
          ).detail,
        ).toContain(
          "cannot change",
        );
        expect(
          eventRunSheetStatusCopy(
            "completed",
          ).detail,
        ).toContain(
          "immutable",
        );
      },
    );

    it(
      "discards privacy-sensitive snapshots but may retain transient in-memory data",
      () => {
        expect(
          shouldDiscardEventRunSheetSnapshot({
            kind:
              "account-changed",
          }),
        ).toBe(
          true,
        );
        expect(
          shouldDiscardEventRunSheetSnapshot({
            kind:
              "permission-denied",
          }),
        ).toBe(
          true,
        );
        expect(
          shouldDiscardEventRunSheetSnapshot({
            kind:
              "offline",
          }),
        ).toBe(
          false,
        );
      },
    );
  },
);
