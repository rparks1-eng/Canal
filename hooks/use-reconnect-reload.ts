import {
  useCallback,
  useRef,
} from "react";

import {
  useFocusEffect,
} from "expo-router";

import {
  consumeReconnectReload,
} from "../lib/connectivity";

import {
  useConnectivity,
} from "../providers/connectivity-provider";

export function useReconnectReload(
  reload: () =>
    | void
    | Promise<void>,
): void {
  const {
    reconnectEpoch,
  } =
    useConnectivity();

  const previousEpoch =
    useRef(
      reconnectEpoch,
    );

  const reloadRef =
    useRef(
      reload,
    );

  reloadRef.current =
    reload;

  useFocusEffect(
    useCallback(
      () => {
        if (
          reconnectEpoch >
          previousEpoch.current
        ) {
          consumeReconnectReload(
            reloadRef.current,
          );
        }

        previousEpoch.current =
          reconnectEpoch;
      },
      [
        reconnectEpoch,
      ],
    ),
  );
}
