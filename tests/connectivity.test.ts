import {
  jest,
  describe,
  expect,
  it,
} from "@jest/globals";

import {
  consumeReconnectReload,
  createConnectivitySampleGate,
  INITIAL_CONNECTIVITY_STATE,
  reduceConnectivityState,
  shouldShowConnectivityBanner,
} from "../lib/connectivity";

describe(
  "connectivity state",
  () => {
    it(
      "does not announce a reconnect during a normal online cold start",
      () => {
        expect(
          shouldShowConnectivityBanner(
            "online",
            0,
            0,
          ),
        ).toBe(
          false,
        );

        expect(
          shouldShowConnectivityBanner(
            "offline",
            0,
            0,
          ),
        ).toBe(
          true,
        );

        expect(
          shouldShowConnectivityBanner(
            "online",
            1,
            1,
          ),
        ).toBe(
          true,
        );

        expect(
          shouldShowConnectivityBanner(
            "online",
            0,
            1,
          ),
        ).toBe(
          false,
        );
      },
    );

    it(
      "keeps unknown separate from confirmed offline",
      () => {
        const unknown =
          reduceConnectivityState(
            INITIAL_CONNECTIVITY_STATE,
            {
              isConnected:
                null,
              isInternetReachable:
                null,
            },
          );

        expect(
          unknown.status,
        ).toBe(
          "unknown",
        );

        const linkOnly =
          reduceConnectivityState(
            unknown,
            {
              isConnected:
                true,
              isInternetReachable:
                null,
            },
          );

        expect(
          linkOnly.status,
        ).toBe(
          "unknown",
        );

        const offline =
          reduceConnectivityState(
            unknown,
            {
              isConnected:
                true,
              isInternetReachable:
                false,
            },
          );

        expect(
          offline.status,
        ).toBe(
          "offline",
        );
      },
    );

    it(
      "increments once when a confirmed connection returns",
      () => {
        const offline =
          reduceConnectivityState(
            INITIAL_CONNECTIVITY_STATE,
            {
              isConnected:
                false,
              isInternetReachable:
                false,
            },
          );

        const online =
          reduceConnectivityState(
            offline,
            {
              isConnected:
                true,
              isInternetReachable:
                true,
            },
          );

        const stillOnline =
          reduceConnectivityState(
            online,
            {
              isConnected:
                true,
              isInternetReachable:
                true,
            },
          );

        expect(
          online.reconnectEpoch,
        ).toBe(
          1,
        );

        expect(
          stillOnline.reconnectEpoch,
        ).toBe(
          1,
        );
      },
    );

    it(
      "retains a confirmed offline state through an indeterminate sample",
      () => {
        const offline =
          reduceConnectivityState(
            INITIAL_CONNECTIVITY_STATE,
            {
              isConnected:
                false,
              isInternetReachable:
                false,
            },
          );

        const indeterminate =
          reduceConnectivityState(
            offline,
            {
              isConnected:
                true,
              isInternetReachable:
                null,
            },
          );

        const online =
          reduceConnectivityState(
            indeterminate,
            {
              isConnected:
                true,
              isInternetReachable:
                true,
            },
          );

        expect(
          indeterminate.status,
        ).toBe(
          "offline",
        );

        expect(
          online.reconnectEpoch,
        ).toBe(
          1,
        );
      },
    );

    it(
      "rejects a slow refresh after a newer listener sample",
      () => {
        const gate =
          createConnectivitySampleGate();
        const slowRefresh =
          gate.begin();
        const listenerSample =
          gate.begin();

        let current =
          reduceConnectivityState(
            INITIAL_CONNECTIVITY_STATE,
            {
              isConnected:
                false,
              isInternetReachable:
                false,
            },
          );

        if (
          gate.isCurrent(
            listenerSample,
          )
        ) {
          current =
            reduceConnectivityState(
              current,
              {
                isConnected:
                  false,
                isInternetReachable:
                  false,
              },
            );
        }

        if (
          gate.isCurrent(
            slowRefresh,
          )
        ) {
          current =
            reduceConnectivityState(
              current,
              {
                isConnected:
                  true,
                isInternetReachable:
                  true,
              },
            );
        }

        expect(
          current.status,
        ).toBe(
          "offline",
        );
        expect(
          current.reconnectEpoch,
        ).toBe(
          0,
        );
      },
    );

    it(
      "rejects an older refresh as soon as a newer refresh begins",
      () => {
        const gate =
          createConnectivitySampleGate();
        const olderRefresh =
          gate.begin();
        const newerRefresh =
          gate.begin();
        let current =
          reduceConnectivityState(
            INITIAL_CONNECTIVITY_STATE,
            {
              isConnected:
                false,
              isInternetReachable:
                false,
            },
          );

        expect(
          gate.isCurrent(
            olderRefresh,
          ),
        ).toBe(
          false,
        );
        expect(
          gate.isCurrent(
            newerRefresh,
          ),
        ).toBe(
          true,
        );

        if (
          gate.isCurrent(
            olderRefresh,
          )
        ) {
          current =
            reduceConnectivityState(
              current,
              {
                isConnected:
                  true,
                isInternetReachable:
                  true,
              },
            );
        }

        if (
          gate.isCurrent(
            newerRefresh,
          )
        ) {
          current =
            reduceConnectivityState(
              current,
              {
                isConnected:
                  false,
                isInternetReachable:
                  false,
              },
            );
        }

        expect(
          current.status,
        ).toBe(
          "offline",
        );
        expect(
          current.reconnectEpoch,
        ).toBe(
          0,
        );

        gate.invalidate();

        expect(
          gate.isCurrent(
            newerRefresh,
          ),
        ).toBe(
          false,
        );
      },
    );

    it(
      "consumes synchronous and asynchronous reload failures",
      async () => {
        const syncReload =
          jest.fn<
            () => void
          >(
            () => {
              throw new Error(
                "sync reload failed",
              );
            },
          );
        const asyncReload =
          jest.fn<
            () => Promise<void>
          >(
            async () => {
              throw new Error(
                "async reload failed",
              );
            },
          );

        expect(
          () =>
            consumeReconnectReload(
              syncReload,
            ),
        ).not.toThrow();

        consumeReconnectReload(
          asyncReload,
        );

        await Promise.resolve();
        await Promise.resolve();

        expect(
          syncReload,
        ).toHaveBeenCalledTimes(
          1,
        );
        expect(
          asyncReload,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );
  },
);
