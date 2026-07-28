import {
  mergeActivityItems,
} from "../lib/relationships";

describe(
  "activity synchronization",
  () => {
    it(
      "deduplicates cloud and device activity while preferring cloud state",
      () => {
        const merged =
          mergeActivityItems(
            [
              {
                id: "same",
                type: "follow",
                title: "Cloud copy",
                description: "",
                createdAt:
                  "2026-07-28T02:00:00.000Z",
                isRead: true,
                syncStatus:
                  "synced",
              },
            ],
            [
              {
                id: "same",
                type: "follow",
                title: "Device copy",
                description: "",
                createdAt:
                  "2026-07-28T02:00:00.000Z",
                isRead: false,
                syncStatus:
                  "pending",
              },
              {
                id: "newer",
                type: "scene",
                title: "New Scene",
                description: "",
                createdAt:
                  "2026-07-28T03:00:00.000Z",
                isRead: false,
                syncStatus:
                  "pending",
              },
            ],
          );

        expect(
          merged.map(
            (item) => item.id,
          ),
        ).toEqual([
          "newer",
          "same",
        ]);

        expect(
          merged[1],
        ).toMatchObject({
          title:
            "Cloud copy",
          isRead: true,
          syncStatus:
            "synced",
        });
      },
    );
  },
);
