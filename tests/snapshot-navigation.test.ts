import {
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  snapshotReturnAction,
} from "../lib/snapshot-navigation";

describe(
  "Snapshot return navigation",
  () => {
    it(
      "returns to the screen that opened a Snapshot",
      () => {
        expect(
          snapshotReturnAction(
            true,
          ),
        ).toBe(
          "back",
        );
      },
    );

    it(
      "uses the Snapshots list for a direct link without history",
      () => {
        expect(
          snapshotReturnAction(
            false,
          ),
        ).toBe(
          "/snapshots",
        );
      },
    );
  },
);
