export type ConnectivityStatus =
  | "unknown"
  | "online"
  | "offline";

export type ConnectivityState = {
  status: ConnectivityStatus;
  isInternetReachable:
    | boolean
    | null;
  reconnectEpoch: number;
};

export type ConnectivitySample = {
  isConnected:
    | boolean
    | null;
  isInternetReachable:
    | boolean
    | null;
};

export type ConnectivitySampleGate = {
  begin: () => number;
  isCurrent: (
    generation: number,
  ) => boolean;
  invalidate: () => void;
};

export const INITIAL_CONNECTIVITY_STATE:
  ConnectivityState = {
    status: "unknown",
    isInternetReachable:
      null,
    reconnectEpoch: 0,
  };

export function createConnectivitySampleGate():
  ConnectivitySampleGate {
  let latestGeneration = 0;

  return {
    begin: () => {
      latestGeneration += 1;

      return latestGeneration;
    },
    isCurrent: (
      generation,
    ) =>
      generation ===
      latestGeneration,
    invalidate: () => {
      latestGeneration += 1;
    },
  };
}

export function consumeReconnectReload(
  reload: () =>
    | void
    | Promise<void>,
): void {
  try {
    const result =
      reload();

    if (result) {
      void Promise.resolve(
        result,
      ).catch(
        () => undefined,
      );
    }
  } catch {
    return;
  }
}

export function connectivityStatusFromSample(
  sample: ConnectivitySample,
): ConnectivityStatus {
  if (
    sample.isConnected ===
      false ||
    sample.isInternetReachable ===
      false
  ) {
    return "offline";
  }

  if (
    sample.isConnected ===
      true &&
    sample.isInternetReachable ===
      true
  ) {
    return "online";
  }

  return "unknown";
}

export function shouldShowConnectivityBanner(
  status: ConnectivityStatus,
  visibleReconnectEpoch: number,
  reconnectEpoch: number,
): boolean {
  if (
    status ===
    "offline"
  ) {
    return true;
  }

  return (
    visibleReconnectEpoch >
      0 &&
    visibleReconnectEpoch ===
      reconnectEpoch
  );
}

export function reduceConnectivityState(
  current: ConnectivityState,
  sample: ConnectivitySample,
): ConnectivityState {
  const status =
    connectivityStatusFromSample(
      sample,
    );

  const settledStatus =
    status ===
      "unknown"
      ? current.status
      : status;

  return {
    status:
      settledStatus,
    isInternetReachable:
      sample.isInternetReachable,
    reconnectEpoch:
      current.reconnectEpoch +
      (
        current.status ===
          "offline" &&
        settledStatus ===
          "online"
          ? 1
          : 0
      ),
  };
}
