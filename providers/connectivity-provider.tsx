import type {
  PropsWithChildren,
} from "react";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import NetInfo from "@react-native-community/netinfo";

import type {
  ConnectivityState,
  ConnectivityStatus,
} from "../lib/connectivity";

import {
  createConnectivitySampleGate,
  INITIAL_CONNECTIVITY_STATE,
  reduceConnectivityState,
} from "../lib/connectivity";

type ConnectivityContextValue =
  ConnectivityState & {
    refresh:
      () => Promise<ConnectivityStatus>;
  };

const ConnectivityContext =
  createContext<
    ConnectivityContextValue | undefined
  >(undefined);

export function ConnectivityProvider(
  props: PropsWithChildren,
) {
  const [
    state,
    setState,
  ] =
    useState<ConnectivityState>(
      INITIAL_CONNECTIVITY_STATE,
    );

  const stateRef =
    useRef<ConnectivityState>(
      INITIAL_CONNECTIVITY_STATE,
    );

  const sampleGateRef =
    useRef(
      createConnectivitySampleGate(),
    );

  const applySample =
    useCallback(
      (
        sample: {
          isConnected:
            | boolean
            | null;
          isInternetReachable:
            | boolean
            | null;
        },
        generation: number,
      ): ConnectivityStatus => {
        if (
          !sampleGateRef.current
            .isCurrent(
              generation,
            )
        ) {
          return stateRef.current
            .status;
        }

        const nextState =
          reduceConnectivityState(
            stateRef.current,
            sample,
          );

        stateRef.current =
          nextState;

        setState(
          nextState,
        );

        return nextState.status;
      },
      [],
    );

  useEffect(() => {
    const sampleGate =
      sampleGateRef.current;
    let isActive = true;

    const unsubscribe =
      NetInfo.addEventListener(
        (sample) => {
          if (!isActive) {
            return;
          }

          const generation =
            sampleGate
              .begin();

          applySample({
            isConnected:
              sample.isConnected,
            isInternetReachable:
              sample.isInternetReachable,
          }, generation);
        },
      );

    return () => {
      isActive = false;
      sampleGate.invalidate();
      unsubscribe();
    };
  }, [
    applySample,
  ]);

  const refresh =
    useCallback(
      async (): Promise<ConnectivityStatus> => {
        const generation =
          sampleGateRef.current
            .begin();

        try {
          const sample =
            await NetInfo.fetch();

          const normalizedSample = {
            isConnected:
              sample.isConnected,
            isInternetReachable:
              sample.isInternetReachable,
          };

          return applySample(
            normalizedSample,
            generation,
          );
        } catch {
          return stateRef.current
            .status;
        }
      },
      [
        applySample,
      ],
    );

  const value =
    useMemo(
      () => ({
        ...state,
        refresh,
      }),
      [
        refresh,
        state,
      ],
    );

  return (
    <ConnectivityContext.Provider
      value={value}
    >
      {props.children}
    </ConnectivityContext.Provider>
  );
}

export function useConnectivity(): ConnectivityContextValue {
  const value =
    useContext(
      ConnectivityContext,
    );

  if (!value) {
    throw new Error(
      "useConnectivity must be used inside ConnectivityProvider.",
    );
  }

  return value;
}
