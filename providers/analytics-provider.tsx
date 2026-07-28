import type {
  PropsWithChildren,
} from "react";

import {
  useEffect,
} from "react";

import {
  flushAnalyticsEvents,
  recordSevenDayReturn,
} from "../lib/analytics";

import {
  useAuth,
} from "./auth-provider";

import {
  useConnectivity,
} from "./connectivity-provider";

export function AnalyticsProvider(
  props:
    PropsWithChildren,
) {
  const {
    loading,
    user,
  } =
    useAuth();

  const {
    status,
  } =
    useConnectivity();

  const userId =
    user?.id ??
    null;

  const accountCreatedAt =
    user?.created_at ??
    null;

  useEffect(() => {
    if (
      loading ||
      !userId
    ) {
      return;
    }

    void recordSevenDayReturn(
      accountCreatedAt,
    );

    if (
      status ===
      "online"
    ) {
      void flushAnalyticsEvents();
    }
  }, [
    accountCreatedAt,
    loading,
    status,
    userId,
  ]);

  return props.children;
}
