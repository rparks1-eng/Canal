import { canalDynamicColors } from "../../theme/canal-dynamic-colors";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  RecoveryNotice,
} from "../../components/recovery-notice";

import { ProfileAvatar } from "../../components/profile-avatar";

import {
  useReconnectReload,
} from "../../hooks/use-reconnect-reload";

import type {
  ConnectivityStatus,
} from "../../lib/connectivity";

import {
  captureCreatorReleaseAccount,
  castCreatorReleaseVote,
  closeCreatorRelease,
  loadCreatorRelease,
  openCreatorRelease,
  respondCreatorReleaseCredit,
} from "../../lib/creator-releases";

import {
  contributorConsentLabel,
  createCreatorReleaseMutationLeaseGate,
  creatorReleaseRequestCanCommit,
  creatorReleaseRoleCopy,
  creatorReleaseViewerRole,
  creatorReleaseVoteCopy,
  creatorReleaseVotePercent,
  rankCreatorReleaseResults,
  shouldDiscardCreatorReleaseSnapshot,
} from "../../lib/creator-release-interface";

import type {
  CreatorReleaseMutationLease,
  CreatorReleaseMutationLeaseGate,
} from "../../lib/creator-release-interface";

import type {
  CreatorReleaseDetail,
} from "../../lib/creator-releases";

import {
  classifyRecoveryIssue,
} from "../../lib/recovery-issue";

import type {
  RecoveryIssue,
} from "../../lib/recovery-issue";

import {
  useAuth,
} from "../../providers/auth-provider";

import {
  useConnectivity,
} from "../../providers/connectivity-provider";

type BusyAction =
  | "open"
  | "close"
  | "vote"
  | "accept-credit"
  | "decline-credit"
  | "";

type ReleaseErrorShape = {
  kind?: unknown;
  message?: unknown;
};

type CreatorReleaseAccount =
  Awaited<
    ReturnType<
      typeof captureCreatorReleaseAccount
    >
  >;

export type DetailMutationLease =
  CreatorReleaseMutationLease;

export type DetailMutationLeaseGate =
  CreatorReleaseMutationLeaseGate;

export function createDetailMutationLeaseGate():
  DetailMutationLeaseGate {
  return createCreatorReleaseMutationLeaseGate();
}

export type DetailSnapshotMutationGateInput =
  Readonly<{
    loadInFlight: boolean;
    isLoading: boolean;
    hasFreshSnapshot: boolean;
  }>;

export function detailSnapshotMutationIsBlocked(
  input:
    DetailSnapshotMutationGateInput,
): boolean {
  return (
    input.loadInFlight ||
    input.isLoading ||
    !input.hasFreshSnapshot
  );
}

function taggedError(
  kind: string,
  message: string,
): Error & {
  kind: string;
} {
  return Object.assign(
    new Error(
      message,
    ),
    {
      kind,
    },
  );
}

function releaseIssue(
  error: unknown,
  connectivityStatus:
    ConnectivityStatus,
): RecoveryIssue {
  const shape =
    error &&
    typeof error ===
      "object"
      ? error as ReleaseErrorShape
      : {};

  const kind =
    typeof shape.kind ===
      "string"
      ? shape.kind
      : "";

  const message =
    error instanceof Error
      ? error.message
      : typeof shape.message ===
          "string"
        ? shape.message
        : "";

  if (
    kind === "offline" ||
    connectivityStatus ===
      "offline"
  ) {
    return {
      kind: "offline",
      title:
        "This release is offline",
      message:
        "Reconnect before loading or changing this release. Canal did not queue a credit response, vote, or owner action.",
      action: "retry",
      actionLabel:
        "Check connection",
    };
  }

  if (
    kind ===
      "account-changed"
  ) {
    return {
      kind: "canal-session",
      title:
        "Account changed",
      message:
        "Canal discarded a response from the previous account. Load this release again for the current account.",
      action: "retry",
      actionLabel:
        "Load current account",
    };
  }

  if (
    kind === "blocked"
  ) {
    return {
      kind: "service",
      title:
        "Release blocked",
      message:
        message ||
        "A relationship block prevents this account from viewing or acting on the release.",
      action: "retry",
      actionLabel:
        "Check access",
    };
  }

  if (
    kind ===
      "permission-denied" ||
    kind === "not-found"
  ) {
    return {
      kind: "service",
      title:
        "Release inaccessible",
      message:
        message ||
        "This release is private, missing, or unavailable to this account.",
      action: "retry",
      actionLabel:
        "Try again",
    };
  }

  if (
    kind === "conflict" ||
    kind === "stale"
  ) {
    return {
      kind: "service",
      title:
        "Release changed",
      message:
        message ||
        "The release changed while Canal was working. Reload its current status before trying again.",
      action: "retry",
      actionLabel:
        "Reload release",
    };
  }

  return classifyRecoveryIssue(
    error,
    {
      service: "canal",
      connectivityStatus,
    },
  );
}

function firstParam(
  value:
    | string
    | string[]
    | undefined,
): string {
  if (
    Array.isArray(
      value,
    )
  ) {
    return value[0] ??
      "";
  }

  return value ??
    "";
}

function goBack(): void {
  if (
    router.canGoBack()
  ) {
    router.back();

    return;
  }

  router.replace(
    "/releases" as never,
  );
}

function formatDate(
  value:
    | string
    | null,
): string {
  if (!value) {
    return "";
  }

  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "";
  }

  return date.toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    },
  );
}

export default function CreatorReleaseDetailScreen() {
  const {
    user,
  } = useAuth();

  return (
    <CreatorReleaseDetailContent
      key={
        user?.id ??
        "signed-out"
      }
      expectedUserId={
        user?.id ??
        ""
      }
    />
  );
}

function CreatorReleaseDetailContent(
  props: {
    expectedUserId: string;
  },
) {
  const params =
    useLocalSearchParams<{
      releaseId?:
        | string
        | string[];
    }>();

  const releaseId =
    firstParam(
      params.releaseId,
    );

  const {
    user,
  } = useAuth();

  const {
    refresh:
      refreshConnectivity,
    status:
      connectivityStatus,
  } =
    useConnectivity();

  const [
    release,
    setRelease,
  ] =
    useState<
      CreatorReleaseDetail | null
    >(
      null,
    );

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    hasFreshSnapshot,
    setHasFreshSnapshot,
  ] = useState(false);

  const [
    busyAction,
    setBusyAction,
  ] =
    useState<BusyAction>(
      "",
    );

  const [
    loadError,
    setLoadError,
  ] =
    useState<unknown>(
      null,
    );

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const requestEpoch =
    useRef(0);

  const loadInFlightRef =
    useRef<
      number | null
    >(
      null,
    );

  const freshSnapshotRef =
    useRef(false);

  const isFocusedRef =
    useRef(false);

  const connectivityStatusRef =
    useRef(
      connectivityStatus,
    );

  connectivityStatusRef.current =
    connectivityStatus;

  const mutationLeaseGateRef =
    useRef(
      createDetailMutationLeaseGate(),
    );

  const activeUserIdRef =
    useRef<
      string | null
    >(
      user?.id ??
      null,
    );

  activeUserIdRef.current =
    user?.id ??
    null;

  const releaseIdRef =
    useRef(
      releaseId,
    );

  releaseIdRef.current =
    releaseId;

  const loadRelease =
    useCallback(
      async (
        checkedStatus:
          ConnectivityStatus =
            connectivityStatus,
      ): Promise<boolean> => {
        const epoch =
          requestEpoch.current +
          1;

        requestEpoch.current =
          epoch;

        loadInFlightRef.current =
          epoch;
        freshSnapshotRef.current =
          false;

        setHasFreshSnapshot(
          false,
        );

        const requestedReleaseId =
          releaseId;

        const isCurrent =
          (
            accountUserId:
              string,
          ): boolean =>
            creatorReleaseRequestCanCommit({
              expectedUserId:
                props.expectedUserId,
              activeUserId:
                activeUserIdRef.current,
              accountUserId,
              requestEpoch:
                epoch,
              activeRequestEpoch:
                requestEpoch.current,
              expectedReleaseId:
                requestedReleaseId,
              activeReleaseId:
                releaseIdRef.current,
            });

        setIsLoading(
          true,
        );
        setLoadError(
          null,
        );

        try {
          if (
            !requestedReleaseId
          ) {
            throw taggedError(
              "not-found",
              "The release ID is missing.",
            );
          }

          if (
            !props.expectedUserId
          ) {
            throw taggedError(
              "account-changed",
              "Sign in to load this release.",
            );
          }

          if (
            checkedStatus ===
              "offline"
          ) {
            throw taggedError(
              "offline",
              "Canal is offline.",
            );
          }

          const account =
            await captureCreatorReleaseAccount(
              props.expectedUserId,
            );

          if (
            !isCurrent(
              account.userId,
            )
          ) {
            return false;
          }

          const nextRelease =
            await loadCreatorRelease(
              requestedReleaseId,
              {
                account,
              },
            );

          if (
            !isCurrent(
              account.userId,
            ) ||
            nextRelease.id !==
              requestedReleaseId
          ) {
            return false;
          }

          setRelease(
            nextRelease,
          );

          freshSnapshotRef.current =
            true;
          setHasFreshSnapshot(
            true,
          );

          return true;
        } catch (error) {
          if (
            requestEpoch.current !==
              epoch ||
            releaseIdRef.current !==
              requestedReleaseId ||
            activeUserIdRef.current !==
              props.expectedUserId
          ) {
            return false;
          }

          if (
            shouldDiscardCreatorReleaseSnapshot(
              error,
            )
          ) {
            setRelease(
              null,
            );
            setSuccessMessage(
              "",
            );
          }

          setLoadError(
            error,
          );

          return false;
        } finally {
          if (
            loadInFlightRef.current ===
            epoch
          ) {
            loadInFlightRef.current =
              null;
          }

          if (
            requestEpoch.current ===
              epoch &&
            releaseIdRef.current ===
              requestedReleaseId &&
            activeUserIdRef.current ===
              props.expectedUserId
          ) {
            setIsLoading(
              false,
            );
          }
        }
      },
      [
        connectivityStatus,
        props.expectedUserId,
        releaseId,
      ],
    );

  const loadReleaseRef =
    useRef(
      loadRelease,
    );

  loadReleaseRef.current =
    loadRelease;

  useFocusEffect(
    useCallback(
      () => {
        isFocusedRef.current =
          true;

        void loadReleaseRef.current();

        return () => {
          isFocusedRef.current =
            false;
          requestEpoch.current +=
            1;
          mutationLeaseGateRef.current
            .invalidateCommits();
          freshSnapshotRef.current =
            false;
          loadInFlightRef.current =
            null;

          setHasFreshSnapshot(
            false,
          );
          setIsLoading(
            false,
          );
        };
      },
      [],
    ),
  );

  useReconnectReload(
    useCallback(
      async (): Promise<void> => {
        await loadRelease();
      },
      [
        loadRelease,
      ],
    ),
  );

  const retry =
    useCallback(
      async (): Promise<void> => {
        const checkedStatus =
          await refreshConnectivity();

        await loadRelease(
          checkedStatus,
        );
      },
      [
        loadRelease,
        refreshConnectivity,
      ],
    );

  const snapshotMutationIsBlocked =
    (): boolean =>
      detailSnapshotMutationIsBlocked({
        loadInFlight:
          loadInFlightRef.current !==
          null,
        isLoading,
        hasFreshSnapshot:
          hasFreshSnapshot &&
          freshSnapshotRef.current,
      });

  const runMutation =
    async (
      action: BusyAction,
      announcement: string,
      operation: (
        account:
          CreatorReleaseAccount,
      ) => Promise<unknown>,
    ): Promise<void> => {
      if (
        !release ||
        mutationLeaseGateRef.current
          .isBusy() ||
        busyAction
      ) {
        return;
      }

      if (
        snapshotMutationIsBlocked()
      ) {
        return;
      }

      if (
        connectivityStatus ===
          "offline"
      ) {
        setLoadError(
          taggedError(
            "offline",
            "Canal is offline.",
          ),
        );

        return;
      }

      if (
        loadError
      ) {
        setLoadError(
          taggedError(
            "stale",
            "Reload the release before changing it.",
          ),
        );

        return;
      }

      if (
        activeUserIdRef.current !==
          props.expectedUserId ||
        !props.expectedUserId
      ) {
        setLoadError(
          taggedError(
            "account-changed",
            "The signed-in account changed.",
          ),
        );

        return;
      }

      if (
        release.id !==
          releaseIdRef.current
      ) {
        setLoadError(
          taggedError(
            "stale",
            "The open release route changed.",
          ),
        );

        return;
      }

      const lease =
        mutationLeaseGateRef.current
          .acquire();

      if (!lease) {
        return;
      }

      const mutationReleaseId =
        release.id;

      const isCurrent =
        (
          accountUserId:
            string,
        ): boolean =>
          mutationLeaseGateRef.current
            .canCommit(
              lease,
            ) &&
          releaseIdRef.current ===
            mutationReleaseId &&
          activeUserIdRef.current ===
            accountUserId &&
          accountUserId ===
            props.expectedUserId;

      setBusyAction(
        action,
      );
      setLoadError(
        null,
      );
      setSuccessMessage(
        "",
      );

      try {
        const account =
          await captureCreatorReleaseAccount(
            props.expectedUserId,
          );

        if (
          !isCurrent(
            account.userId,
          )
        ) {
          return;
        }

        await operation(
          account,
        );

        if (
          !isCurrent(
            account.userId,
          )
        ) {
          return;
        }

        const refreshed =
          await loadReleaseRef.current(
            connectivityStatusRef.current,
          );

        if (
          !refreshed ||
          !isCurrent(
            account.userId,
          )
        ) {
          return;
        }

        setSuccessMessage(
          announcement,
        );

        AccessibilityInfo
          .announceForAccessibility(
            announcement,
          );
      } catch (error) {
        if (
          mutationLeaseGateRef.current
            .canCommit(
              lease,
            ) &&
          releaseIdRef.current ===
            mutationReleaseId &&
          activeUserIdRef.current ===
            props.expectedUserId
        ) {
          setLoadError(
            error,
          );
        }
      } finally {
        const commitWasInvalidated =
          !mutationLeaseGateRef.current
            .canCommit(
              lease,
            );

        const shouldReloadAfterSettlement =
          commitWasInvalidated &&
          isFocusedRef.current &&
          releaseIdRef.current ===
            mutationReleaseId &&
          activeUserIdRef.current ===
            props.expectedUserId &&
          connectivityStatusRef.current !==
            "offline";

        const released =
          mutationLeaseGateRef.current
            .release(
              lease,
            );

        if (released) {
          setBusyAction(
            "",
          );

          if (
            shouldReloadAfterSettlement
          ) {
            void loadReleaseRef.current(
              connectivityStatusRef.current,
            );
          }
        }
      }
    };

  const openRelease =
    async (): Promise<void> => {
      if (
        !release ||
        release.ownerId !==
          props.expectedUserId ||
        release.status !==
          "draft"
      ) {
        return;
      }

      await runMutation(
        "open",
        "Voting opened. The ordered Scene IDs and revisions are now frozen.",
        (account) =>
          openCreatorRelease(
            release.id,
            {
              account,
            },
          ),
      );
    };

  const closeRelease =
    async (): Promise<void> => {
      if (
        !release ||
        release.ownerId !==
          props.expectedUserId ||
        release.status !==
          "open"
      ) {
        return;
      }

      await runMutation(
        "close",
        "Voting closed. Final totals are now available.",
        (account) =>
          closeCreatorRelease(
            release.id,
            {
              account,
            },
          ),
      );
    };

  const respondToCredit =
    async (
      response:
        | "accepted"
        | "declined",
    ): Promise<void> => {
      if (
        !release ||
        release.status !==
          "open" ||
        release.viewerContributorStatus ===
          null
      ) {
        return;
      }

      await runMutation(
        response ===
          "accepted"
          ? "accept-credit"
          : "decline-credit",
        response ===
          "accepted"
          ? "Public contributor credit accepted."
          : "Public contributor credit declined.",
        (account) =>
          respondCreatorReleaseCredit(
            release.id,
            response,
            {
              account,
            },
          ),
      );
    };

  const castVote =
    async (
      sceneId: string,
    ): Promise<void> => {
      if (
        !release ||
        release.status !==
          "open" ||
        release.ownerId ===
          props.expectedUserId ||
        !release.items.some(
          (item) =>
            item.sceneId ===
            sceneId,
        )
      ) {
        return;
      }

      const changing =
        Boolean(
          release.selectedVoteSceneId,
        );

      await runMutation(
        "vote",
        changing
          ? "Favorite Scene changed."
          : "Favorite Scene selected.",
        (account) =>
          castCreatorReleaseVote(
            release.id,
            sceneId,
            {
              account,
            },
          ),
      );
    };

  const confirmOpen =
    (): void => {
      if (
        !release ||
        release.ownerId !==
          props.expectedUserId ||
        release.status !==
          "draft"
      ) {
        return;
      }

      Alert.alert(
        "Open voting?",
        "Opening is irreversible. Canal will freeze the current ordered Scene IDs and revisions from the public collection.",
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text:
              "Open voting",
            onPress: () => {
              void openRelease();
            },
          },
        ],
      );
    };

  const confirmClose =
    (): void => {
      if (
        !release ||
        release.ownerId !==
          props.expectedUserId ||
        release.status !==
          "open"
      ) {
        return;
      }

      Alert.alert(
        "Close voting?",
        "Listeners will no longer be able to cast or change a favorite. Final totals and winner information will become visible.",
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text:
              "Close voting",
            style:
              "destructive",
            onPress: () => {
              void closeRelease();
            },
          },
        ],
      );
    };

  const isOwner =
    Boolean(
      release &&
      release.ownerId ===
        props.expectedUserId,
    );

  const viewerRole =
    release
      ? creatorReleaseViewerRole(
          release,
          props.expectedUserId,
        )
      : "listener";

  const roleCopy =
    release
      ? creatorReleaseRoleCopy(
          viewerRole,
          release.status,
        )
      : null;

  const acceptedContributors =
    useMemo(
      () =>
        release
          ? release.contributors.filter(
              (contributor) =>
                contributor.status ===
                  "accepted",
            )
          : [],
      [
        release,
      ],
    );

  const rankedResults =
    useMemo(
      () =>
        release?.results
          ? rankCreatorReleaseResults(
              release.results.items,
            )
          : [],
      [
        release,
      ],
    );

  const issue =
    loadError
      ? releaseIssue(
          loadError,
          connectivityStatus,
        )
      : null;

  const actionsBlocked =
    snapshotMutationIsBlocked() ||
    mutationLeaseGateRef.current
      .isBusy() ||
    Boolean(
      busyAction,
    ) ||
    Boolean(
      loadError,
    ) ||
    connectivityStatus ===
      "offline";

  const acceptCreditDisabled =
    actionsBlocked ||
    release?.viewerContributorStatus ===
      "accepted";

  const declineCreditDisabled =
    actionsBlocked ||
    release?.viewerContributorStatus ===
      "declined";

  const statusLabel =
    release?.status ===
      "open"
      ? "VOTING OPEN"
      : release?.status ===
          "closed"
        ? "CLOSED"
        : "DRAFT";

  return (
    <SafeAreaView
      edges={[
        "top",
        "left",
        "right",
      ]}
      style={
        styles.safeArea
      }
    >
      <View
        style={
          styles.header
        }
      >
        <Pressable
          accessibilityHint="Returns to the previous Canal screen"
          accessibilityLabel="Go back"
          accessibilityRole="button"
          hitSlop={8}
          onPress={
            goBack
          }
          style={({
            pressed,
          }) => [
            styles.headerButton,
            pressed &&
              styles.pressed,
          ]}
        >
          <Text
            style={
              styles.backText
            }
          >
            ‹
          </Text>
        </Pressable>

        <Text
          style={
            styles.headerTitle
          }
        >
          Release Ballot
        </Text>

        <View
          style={
            styles.headerSpacer
          }
        />
      </View>

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        contentInsetAdjustmentBehavior="automatic"
      >
        <View
          style={
            styles.column
          }
        >
          {issue ? (
            <>
              {release ? (
                <View
                  accessibilityLiveRegion="polite"
                  accessibilityRole="alert"
                  style={
                    styles.staleNotice
                  }
                >
                  <Text
                    selectable
                    style={
                      styles.staleText
                    }
                  >
                    Showing the last loaded release. Actions are paused until Canal refreshes its current status and access.
                  </Text>
                </View>
              ) : null}

              <RecoveryNotice
                busy={
                  isLoading
                }
                issue={
                  issue
                }
                onAction={
                  retry
                }
              />
            </>
          ) : null}

          {isLoading &&
          !release ? (
            <View
              accessibilityLabel="Loading release ballot"
              accessibilityLiveRegion="polite"
              style={
                styles.loading
              }
            >
              <ActivityIndicator
                color="#F47A24"
                size="large"
              />

              <Text
                style={
                  styles.loadingText
                }
              >
                Loading release ballot…
              </Text>
            </View>
          ) : null}

          {isLoading &&
          release &&
          !issue ? (
            <View
              accessibilityLiveRegion="polite"
              style={
                styles.refreshNotice
              }
            >
              <ActivityIndicator
                color="#A84B0E"
                size="small"
              />

              <Text
                selectable
                style={
                  styles.refreshText
                }
              >
                Refreshing ballot status and access…
              </Text>
            </View>
          ) : null}

          {connectivityStatus ===
            "offline" &&
          release &&
          !issue ? (
            <View
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
              style={
                styles.offlineNotice
              }
            >
              <Text
                selectable
                style={
                  styles.offlineText
                }
              >
                Offline. This is the last loaded ballot; voting, contributor responses, and owner actions are paused.
              </Text>
            </View>
          ) : null}

          {!isLoading &&
          !release &&
          !issue ? (
            <View
              style={
                styles.emptyCard
              }
            >
              <Text
                selectable
                style={
                  styles.emptyTitle
                }
              >
                Release unavailable
              </Text>

              <Text
                selectable
                style={
                  styles.emptyText
                }
              >
                This release may be missing, private, blocked, or no longer accessible to this account.
              </Text>
            </View>
          ) : null}

          {release ? (
            <>
              <View
                style={
                  styles.hero
                }
              >
                <View
                  style={
                    styles.heroTopRow
                  }
                >
                  <View
                    style={[
                      styles.statusBadge,
                      release.status ===
                        "closed" &&
                        styles.closedBadge,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        release.status ===
                          "closed" &&
                          styles.closedStatusText,
                      ]}
                    >
                      {statusLabel}
                    </Text>
                  </View>

                  <Text
                    style={
                      styles.roleLabel
                    }
                  >
                    {
                      roleCopy
                        ?.label
                    }
                  </Text>
                </View>

                <Text
                  selectable
                  style={
                    styles.title
                  }
                >
                  {
                    release.title
                  }
                </Text>

                {release.description ? (
                  <Text
                    selectable
                    style={
                      styles.description
                    }
                  >
                    {
                      release.description
                    }
                  </Text>
                ) : null}

                <Text
                  selectable
                  style={
                    styles.dateText
                  }
                >
                  {release.status ===
                    "draft"
                    ? `Draft created ${formatDate(release.createdAt)}`
                    : release.status ===
                        "open"
                      ? `Opened ${formatDate(release.openedAt)}`
                      : `Closed ${formatDate(release.closedAt)}`}
                </Text>
              </View>

              {roleCopy ? (
                <View
                  accessibilityLabel={`${roleCopy.label}. ${roleCopy.title} ${roleCopy.detail}`}
                  style={
                    styles.roleCard
                  }
                >
                  <View
                    style={
                      styles.roleMarker
                    }
                  >
                    <Text
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                      style={
                        styles.roleMarkerText
                      }
                    >
                      {viewerRole ===
                        "owner"
                        ? "O"
                        : viewerRole ===
                            "contributor"
                          ? "C"
                          : "L"}
                    </Text>
                  </View>

                  <View
                    style={
                      styles.roleCopy
                    }
                  >
                    <Text
                      selectable
                      style={
                        styles.roleTitle
                      }
                    >
                      {
                        roleCopy.title
                      }
                    </Text>

                    <Text
                      selectable
                      style={
                        styles.roleDetail
                      }
                    >
                      {
                        roleCopy.detail
                      }
                    </Text>
                  </View>
                </View>
              ) : null}

              {successMessage ? (
                <View
                  accessibilityLiveRegion="polite"
                  accessibilityRole="alert"
                  style={
                    styles.successNotice
                  }
                >
                  <Text
                    selectable
                    style={
                      styles.successText
                    }
                  >
                    {successMessage}
                  </Text>
                </View>
              ) : null}

              {isOwner &&
              release.status ===
                "draft" ? (
                <View
                  style={
                    styles.ownerCard
                  }
                >
                  <Text
                    selectable
                    style={
                      styles.ownerTitle
                    }
                  >
                    Ready to freeze the ballot?
                  </Text>

                  <Text
                    selectable
                    style={
                      styles.ownerText
                    }
                  >
                    Opening copies the collection’s ordered Scene IDs and revision numbers. Those opened items cannot be replaced or reordered.
                  </Text>

                  <Pressable
                    accessibilityLabel={
                      busyAction ===
                        "open"
                        ? "Opening voting"
                        : "Open voting and freeze Scenes"
                    }
                    accessibilityRole="button"
                    accessibilityState={{
                      busy:
                        busyAction ===
                        "open",
                      disabled:
                        actionsBlocked,
                    }}
                    disabled={
                      actionsBlocked
                    }
                    onPress={
                      confirmOpen
                    }
                    style={[
                      styles.primaryButton,
                      actionsBlocked &&
                        styles.disabledButton,
                    ]}
                  >
                    {busyAction ===
                    "open" ? (
                      <ActivityIndicator
                        color="#FFFFFF"
                        size="small"
                      />
                    ) : null}

                    <Text
                      style={
                        styles.primaryButtonText
                      }
                    >
                      {busyAction ===
                      "open"
                        ? "Opening…"
                        : "Open voting"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {isOwner &&
              release.status ===
                "open" ? (
                <View
                  style={
                    styles.ownerCard
                  }
                >
                  <Text
                    selectable
                    style={
                      styles.ownerTitle
                    }
                  >
                    Voting is open
                  </Text>

                  <Text
                    selectable
                    style={
                      styles.ownerText
                    }
                  >
                    Results remain hidden until you close voting. Closing is final and prevents new or changed selections.
                  </Text>

                  <Pressable
                    accessibilityLabel={
                      busyAction ===
                        "close"
                        ? "Closing voting"
                        : "Close voting and reveal final totals"
                    }
                    accessibilityRole="button"
                    accessibilityState={{
                      busy:
                        busyAction ===
                        "close",
                      disabled:
                        actionsBlocked,
                    }}
                    disabled={
                      actionsBlocked
                    }
                    onPress={
                      confirmClose
                    }
                    style={[
                      styles.closeButton,
                      actionsBlocked &&
                        styles.disabledButton,
                    ]}
                  >
                    {busyAction ===
                    "close" ? (
                      <ActivityIndicator
                        color="#8C352D"
                        size="small"
                      />
                    ) : null}

                    <Text
                      style={
                        styles.closeButtonText
                      }
                    >
                      {busyAction ===
                      "close"
                        ? "Closing…"
                        : "Close voting"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {release.viewerContributorStatus !==
              null ? (
                <View
                  style={
                    styles.creditCard
                  }
                >
                  <Text
                    style={
                      styles.eyebrow
                    }
                  >
                    CONTRIBUTOR CREDIT
                  </Text>

                  <Text
                    selectable
                    style={
                      styles.creditTitle
                    }
                  >
                    {release.status ===
                      "open"
                      ? "Choose your public credit."
                      : release.status ===
                          "closed"
                        ? "Contributor credit is closed."
                        : "Contributor credit opens with voting."}
                  </Text>

                  <Text
                    selectable
                    style={
                      styles.creditText
                    }
                  >
                    {release.status ===
                      "open"
                      ? "Accept to show your profile with this release, or decline to keep it off the public contributor list."
                      : "Your response is read-only until the release is open, and after it closes."}
                  </Text>

                  <View
                    accessibilityLabel={`Current contributor response: ${contributorConsentLabel(release.viewerContributorStatus)}`}
                    style={
                      styles.consentStatusRow
                    }
                  >
                    <Text
                      style={
                        styles.consentStatusLabel
                      }
                    >
                      Current response
                    </Text>

                    <View
                      style={
                        styles.consentStatusBadge
                      }
                    >
                      <Text
                        style={
                          styles.creditStatus
                        }
                      >
                        {contributorConsentLabel(
                          release.viewerContributorStatus,
                        )}
                      </Text>
                    </View>
                  </View>

                  {release.status ===
                  "open" ? (
                    <View
                      style={
                        styles.creditActions
                      }
                    >
                      <Pressable
                        accessibilityLabel="Accept public contributor credit"
                        accessibilityRole="button"
                        accessibilityState={{
                          busy:
                            busyAction ===
                            "accept-credit",
                          selected:
                            release.viewerContributorStatus ===
                            "accepted",
                          disabled:
                            acceptCreditDisabled,
                        }}
                        disabled={
                          acceptCreditDisabled
                        }
                        onPress={() => {
                          void respondToCredit(
                            "accepted",
                          );
                        }}
                        style={[
                          styles.creditButton,
                          release.viewerContributorStatus ===
                            "accepted" &&
                            styles.creditButtonSelected,
                          acceptCreditDisabled &&
                            styles.disabledButton,
                        ]}
                      >
                        {busyAction ===
                        "accept-credit" ? (
                          <ActivityIndicator
                            color="#FFFFFF"
                            size="small"
                          />
                        ) : null}

                        <Text
                          style={[
                            styles.creditButtonText,
                            release.viewerContributorStatus ===
                              "accepted" &&
                              styles.creditButtonSelectedText,
                          ]}
                        >
                          Accept credit
                        </Text>
                      </Pressable>

                      <Pressable
                        accessibilityLabel="Decline public contributor credit"
                        accessibilityRole="button"
                        accessibilityState={{
                          busy:
                            busyAction ===
                            "decline-credit",
                          selected:
                            release.viewerContributorStatus ===
                            "declined",
                          disabled:
                            declineCreditDisabled,
                        }}
                        disabled={
                          declineCreditDisabled
                        }
                        onPress={() => {
                          void respondToCredit(
                            "declined",
                          );
                        }}
                        style={[
                          styles.creditButton,
                          release.viewerContributorStatus ===
                            "declined" &&
                            styles.declineButtonSelected,
                          declineCreditDisabled &&
                            styles.disabledButton,
                        ]}
                      >
                        {busyAction ===
                        "decline-credit" ? (
                          <ActivityIndicator
                            color="#8C352D"
                            size="small"
                          />
                        ) : null}

                        <Text
                          style={
                            styles.creditButtonText
                          }
                        >
                          Decline credit
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {acceptedContributors.length >
              0 ? (
                <View
                  style={
                    styles.section
                  }
                >
                  <Text
                    style={
                      styles.sectionTitle
                    }
                  >
                    Accepted contributors
                  </Text>

                  <Text
                    selectable
                    style={
                      styles.sectionDescription
                    }
                  >
                    Only collaborators who accepted public credit appear here.
                  </Text>

                  <View
                    style={
                      styles.contributorList
                    }
                  >
                    {acceptedContributors.map(
                      (contributor) => {
                        const profile =
                          contributor.profile;

                        const displayName =
                          profile
                            ?.displayName ??
                          "Canal contributor";

                        const handle =
                          profile
                            ?.handle ??
                          "Contributor credit";

                        return (
                          <Pressable
                            accessibilityHint="Opens this accepted contributor’s Canal profile"
                            accessibilityLabel={`${displayName}, ${handle}, accepted contributor`}
                            accessibilityRole="button"
                            accessibilityState={{
                              disabled:
                                actionsBlocked,
                            }}
                            disabled={
                              actionsBlocked
                            }
                            key={
                              contributor.contributorId
                            }
                            onPress={() => {
                              if (
                                actionsBlocked
                              ) {
                                return;
                              }

                              router.push({
                                pathname:
                                  "/creator/[userId]",
                                params: {
                                  userId:
                                    contributor.contributorId,
                                },
                              } as never);
                            }}
                            style={[
                              styles.contributorCard,
                              actionsBlocked &&
                                styles.disabledButton,
                            ]}
                          >
                            <ProfileAvatar
                              avatarUrl={contributor.profile?.avatarUrl}
                              displayName={displayName}
                              size={46}
                            />

                            <View
                              style={
                                styles.contributorCopy
                              }
                            >
                              <Text
                                numberOfLines={1}
                                selectable
                                style={
                                  styles.contributorName
                                }
                              >
                                {displayName}
                              </Text>

                              <Text
                                numberOfLines={1}
                                selectable
                                style={
                                  styles.contributorHandle
                                }
                              >
                                {handle}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      },
                    )}
                  </View>
                </View>
              ) : null}

              <View
                style={
                  styles.section
                }
              >
                <View
                  style={
                    styles.sectionHeader
                  }
                >
                  <Text
                    style={
                      styles.sectionTitle
                    }
                  >
                    {release.status ===
                      "draft"
                      ? "Collection preview"
                      : "Frozen Scenes"}
                  </Text>

                  <Text
                    style={
                      styles.sectionCount
                    }
                  >
                    {
                      release.items.length
                    }
                  </Text>
                </View>

                <Text
                  selectable
                  style={
                    styles.sectionDescription
                  }
                >
                  {release.status ===
                    "draft"
                    ? "The ordered Scene IDs and revisions will be captured transactionally when the owner opens voting."
                    : "This order and every displayed revision were frozen when voting opened."}
                </Text>

                {release.items.length ===
                0 ? (
                  <View
                    style={
                      styles.emptyItems
                    }
                  >
                    <Text
                      selectable
                      style={
                        styles.emptyItemsText
                      }
                    >
                      {release.status ===
                        "draft"
                        ? "No opened items yet."
                        : "The frozen Scene list is unavailable. Reload before continuing."}
                    </Text>
                  </View>
                ) : (
                  <View
                    accessibilityRole={
                      release.status ===
                        "open" &&
                      !isOwner
                        ? "radiogroup"
                        : undefined
                    }
                    style={
                      styles.itemList
                    }
                  >
                    {release.items.map(
                      (
                        item,
                        index,
                      ) => {
                        const voteCopy =
                          creatorReleaseVoteCopy(
                            release.selectedVoteSceneId,
                            item.sceneId,
                          );

                        const {
                          selected,
                        } =
                          voteCopy;

                        const canVote =
                          release.status ===
                            "open" &&
                          !isOwner;

                        const voteDisabled =
                          actionsBlocked ||
                          selected;

                        return (
                          <Pressable
                            accessibilityHint={
                              canVote
                                ? voteCopy.hint
                                : undefined
                            }
                            accessibilityLabel={`${index + 1}. ${item.title}. Frozen revision ${item.sceneRevision}${canVote ? `. ${voteCopy.label}` : ""}`}
                            accessibilityRole={
                              canVote
                                ? "radio"
                                : "text"
                            }
                            accessibilityState={
                              canVote
                                ? {
                                    busy:
                                      busyAction ===
                                      "vote",
                                    checked:
                                      selected,
                                    disabled:
                                      voteDisabled,
                                  }
                                : undefined
                            }
                            disabled={
                              !canVote ||
                              voteDisabled
                            }
                            key={`${item.sceneId}:${item.position}:${item.sceneRevision}`}
                            onPress={() => {
                              if (
                                !canVote ||
                                voteDisabled
                              ) {
                                return;
                              }

                              void castVote(
                                item.sceneId,
                              );
                            }}
                            style={({
                              pressed,
                            }) => [
                              styles.itemCard,
                              selected &&
                                styles.itemCardSelected,
                              pressed &&
                                styles.pressed,
                            ]}
                          >
                            <View
                              style={
                                styles.position
                              }
                            >
                              <Text
                                style={
                                  styles.positionText
                                }
                              >
                                {
                                  index +
                                  1
                                }
                              </Text>
                            </View>

                            <View
                              style={
                                styles.itemCopy
                              }
                            >
                              <Text
                                numberOfLines={2}
                                selectable
                                style={
                                  styles.itemTitle
                                }
                              >
                                {
                                  item.title
                                }
                              </Text>

                              <Text
                                selectable
                                style={
                                  styles.revision
                                }
                              >
                                Frozen revision{" "}
                                {
                                  item.sceneRevision
                                }
                              </Text>

                              {canVote ? (
                                <Text
                                  style={[
                                    styles.voteActionLabel,
                                    selected &&
                                      styles.voteActionLabelSelected,
                                  ]}
                                >
                                  {
                                    voteCopy.label
                                  }
                                </Text>
                              ) : null}
                            </View>

                            {canVote ? (
                              <View
                                style={[
                                  styles.voteRadio,
                                  selected &&
                                    styles.voteRadioSelected,
                                ]}
                              >
                                {selected ? (
                                  <View
                                    style={
                                      styles.voteDot
                                    }
                                  />
                                ) : null}
                              </View>
                            ) : null}
                          </Pressable>
                        );
                      },
                    )}
                  </View>
                )}
              </View>

              {release.status ===
                "open" &&
              !isOwner ? (
                <View
                  accessibilityLiveRegion="polite"
                  style={
                    styles.voteNotice
                  }
                >
                  <Text
                    selectable
                    style={
                      styles.voteNoticeTitle
                    }
                  >
                    {release.selectedVoteSceneId
                      ? "Your favorite is saved"
                      : "Choose one favorite Scene"}
                  </Text>

                  <Text
                    selectable
                    style={
                      styles.voteNoticeText
                    }
                  >
                    {release.selectedVoteSceneId
                      ? "Select a different Scene above to change your choice before the owner closes voting."
                      : "You can change your choice while voting remains open. Results stay hidden until closure."}
                  </Text>
                </View>
              ) : null}

              {release.status !==
              "closed" ? (
                <View
                  style={
                    styles.privateResults
                  }
                >
                  <Text
                    selectable
                    style={
                      styles.privateResultsTitle
                    }
                  >
                    Results are sealed
                  </Text>

                  <Text
                    selectable
                    style={
                      styles.privateResultsText
                    }
                  >
                    Totals and winning Scene information remain hidden until the owner closes voting. Individual choices are never displayed.
                  </Text>
                </View>
              ) : null}

              {release.status ===
                "closed" &&
              release.results ? (
                <View
                  accessibilityLabel="Final release results"
                  style={
                    styles.resultsCard
                  }
                >
                  <Text
                    style={
                      styles.resultsEyebrow
                    }
                  >
                    FINAL RESULTS
                  </Text>

                  <Text
                    selectable
                    style={
                      styles.resultsTitle
                    }
                  >
                    {release.results.winnerSceneIds.length >
                    1
                      ? "Winning Scenes"
                      : release.results.winnerSceneIds.length ===
                          1
                        ? "Winning Scene"
                        : "No winner"}
                  </Text>

                  <Text
                    accessibilityLabel={`${release.results.totalVotes} total ${release.results.totalVotes === 1 ? "vote" : "votes"}`}
                    selectable
                    style={
                      styles.totalVotes
                    }
                  >
                    {
                      release.results.totalVotes
                    }{" "}
                    total{" "}
                    {release.results.totalVotes ===
                    1
                      ? "vote"
                      : "votes"}
                  </Text>

                  {release.results.totalVotes ===
                  0 ? (
                    <Text
                      selectable
                      style={
                        styles.noVotesText
                      }
                    >
                      Voting closed without a selection.
                    </Text>
                  ) : (
                    <View
                      style={
                        styles.resultList
                      }
                    >
                      {rankedResults.map(
                        (
                          item,
                          index,
                        ) => {
                          const percent =
                            creatorReleaseVotePercent(
                              item.voteCount,
                              release.results
                                ?.totalVotes ??
                                0,
                            );

                          return (
                            <View
                              accessibilityLabel={`${item.title}, ${item.voteCount} ${item.voteCount === 1 ? "vote" : "votes"}, ${percent} percent${item.isWinner ? ", winner" : ""}`}
                              key={`${item.sceneId}:${item.position}:result`}
                              style={[
                                styles.resultRow,
                                item.isWinner &&
                                  styles.winnerRow,
                              ]}
                            >
                              <View
                                style={
                                  styles.resultPosition
                                }
                              >
                                <Text
                                  style={
                                    styles.resultPositionText
                                  }
                                >
                                  {
                                    index +
                                    1
                                  }
                                </Text>
                              </View>

                              <View
                                style={
                                  styles.resultCopy
                                }
                              >
                                <Text
                                  numberOfLines={2}
                                  selectable
                                  style={
                                    styles.resultName
                                  }
                                >
                                  {
                                    item.title
                                  }
                                </Text>

                                <View
                                  style={
                                    styles.resultMetaRow
                                  }
                                >
                                  {item.isWinner ? (
                                    <Text
                                      style={
                                        styles.winnerLabel
                                      }
                                    >
                                      WINNER
                                    </Text>
                                  ) : null}

                                  <Text
                                    style={
                                      styles.resultPercent
                                    }
                                  >
                                    {
                                      percent
                                    }
                                    %
                                  </Text>
                                </View>

                                <View
                                  accessibilityElementsHidden
                                  importantForAccessibility="no"
                                  style={
                                    styles.resultTrack
                                  }
                                >
                                  <View
                                    style={[
                                      styles.resultFill,
                                      {
                                        width:
                                          `${percent}%`,
                                      },
                                    ]}
                                  />
                                </View>
                              </View>

                              <Text
                                selectable
                                style={
                                  styles.resultCount
                                }
                              >
                                {
                                  item.voteCount
                                }
                              </Text>
                            </View>
                          );
                        },
                      )}
                    </View>
                  )}

                  <Text
                    selectable
                    style={
                      styles.privacyText
                    }
                  >
                    Final aggregate totals only. Individual listener choices are not revealed.
                  </Text>
                </View>
              ) : null}

              {release.status ===
                "closed" &&
              !release.results ? (
                <View
                  accessibilityRole="alert"
                  style={
                    styles.emptyItems
                  }
                >
                  <Text
                    selectable
                    style={
                      styles.emptyItemsText
                    }
                  >
                    Final results are unavailable. Reload this closed release.
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: canalDynamicColors.surface,
    },

    header: {
      minHeight: 58,
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      paddingHorizontal: 20,
      paddingVertical: 8,
    },

    headerButton: {
      width: 44,
      height: 44,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 22,
      backgroundColor: canalDynamicColors.surface,
    },

    backText: {
      color: canalDynamicColors.text,
      fontSize: 34,
      lineHeight: 36,
    },

    headerTitle: {
      color: canalDynamicColors.text,
      fontSize: 16,
      fontWeight: "900",
    },

    headerSpacer: {
      width: 44,
    },

    content: {
      flexGrow: 1,
      paddingHorizontal: 20,
      paddingBottom: 52,
    },

    column: {
      width: "100%",
      maxWidth: 720,
      alignSelf: "center",
      gap: 16,
    },

    staleNotice: {
      padding: 14,
      borderWidth: 1,
      borderColor:
        "#E9C89B",
      borderRadius: 16,
      borderCurve:
        "continuous",
      backgroundColor:
        "#FFF6DF",
    },

    staleText: {
      color: "#735320",
      fontSize: 12,
      lineHeight: 18,
    },

    refreshNotice: {
      minHeight: 44,
      flexDirection: "row",
      alignItems:
        "center",
      gap: 9,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 15,
      borderCurve:
        "continuous",
      backgroundColor:
        "#FFF3E9",
    },

    refreshText: {
      flex: 1,
      color: "#7C451F",
      fontSize: 12,
      lineHeight: 18,
    },

    offlineNotice: {
      padding: 14,
      borderWidth: 1,
      borderColor:
        "#D8C7A6",
      borderRadius: 16,
      borderCurve:
        "continuous",
      backgroundColor:
        "#FFF7DF",
    },

    offlineText: {
      color: "#6E5525",
      fontSize: 12,
      lineHeight: 18,
    },

    loading: {
      minHeight: 260,
      alignItems:
        "center",
      justifyContent:
        "center",
      gap: 12,
    },

    loadingText: {
      color: canalDynamicColors.muted,
      fontSize: 13,
    },

    emptyCard: {
      gap: 10,
      padding: 22,
      borderWidth: 1,
      borderColor:
        "#EEE2D8",
      borderRadius: 22,
      borderCurve:
        "continuous",
      backgroundColor: canalDynamicColors.surface,
    },

    emptyTitle: {
      color: canalDynamicColors.text,
      fontSize: 21,
      fontWeight: "900",
    },

    emptyText: {
      color: canalDynamicColors.muted,
      fontSize: 13,
      lineHeight: 20,
    },

    hero: {
      gap: 10,
      padding: 21,
      borderRadius: 25,
      borderCurve:
        "continuous",
      backgroundColor:
        "#2B1710",
    },

    heroTopRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 12,
    },

    statusBadge: {
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 9,
      backgroundColor: canalDynamicColors.warningSurface,
    },

    closedBadge: {
      backgroundColor:
        "#DFF3E6",
    },

    statusText: {
      color: canalDynamicColors.gold,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.6,
    },

    closedStatusText: {
      color: "#326646",
    },

    roleLabel: {
      flexShrink: 1,
      color: canalDynamicColors.muted,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.6,
      textAlign: "right",
    },

    title: {
      color: canalDynamicColors.text,
      fontSize: 29,
      fontWeight: "900",
      lineHeight: 35,
    },

    description: {
      color: canalDynamicColors.muted,
      fontSize: 13,
      lineHeight: 20,
    },

    dateText: {
      color: canalDynamicColors.muted,
      fontSize: 10,
    },

    roleCard: {
      minHeight: 76,
      flexDirection: "row",
      alignItems:
        "center",
      gap: 13,
      padding: 16,
      borderWidth: 1,
      borderColor:
        "#E8DED5",
      borderRadius: 20,
      borderCurve:
        "continuous",
      backgroundColor: canalDynamicColors.surface,
    },

    roleMarker: {
      width: 42,
      height: 42,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 14,
      borderCurve:
        "continuous",
      backgroundColor: canalDynamicColors.warningSurface,
    },

    roleMarkerText: {
      color: canalDynamicColors.gold,
      fontSize: 16,
      fontWeight: "900",
    },

    roleCopy: {
      flex: 1,
      gap: 4,
    },

    roleTitle: {
      color: canalDynamicColors.text,
      fontSize: 14,
      fontWeight: "900",
    },

    roleDetail: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      lineHeight: 17,
    },

    successNotice: {
      padding: 14,
      borderWidth: 1,
      borderColor:
        "#B8DEC5",
      borderRadius: 16,
      borderCurve:
        "continuous",
      backgroundColor:
        "#EAF7EE",
    },

    successText: {
      color: "#2F6543",
      fontSize: 12,
      fontWeight: "800",
      lineHeight: 18,
    },

    ownerCard: {
      gap: 10,
      padding: 18,
      borderWidth: 1,
      borderColor:
        "#EADBCF",
      borderRadius: 21,
      borderCurve:
        "continuous",
      backgroundColor: canalDynamicColors.surface,
    },

    ownerTitle: {
      color: canalDynamicColors.text,
      fontSize: 18,
      fontWeight: "900",
    },

    ownerText: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      lineHeight: 19,
    },

    primaryButton: {
      minHeight: 50,
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "center",
      gap: 9,
      borderRadius: 16,
      borderCurve:
        "continuous",
      backgroundColor:
        "#F47A24",
    },

    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "900",
    },

    closeButton: {
      minHeight: 50,
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "center",
      gap: 9,
      borderWidth: 1,
      borderColor:
        "#E7BDB6",
      borderRadius: 16,
      borderCurve:
        "continuous",
      backgroundColor:
        "#FFF0EE",
    },

    closeButtonText: {
      color: "#8C352D",
      fontSize: 13,
      fontWeight: "900",
    },

    creditCard: {
      gap: 10,
      padding: 18,
      borderWidth: 1,
      borderColor:
        "#E7C6AC",
      borderRadius: 21,
      borderCurve:
        "continuous",
      backgroundColor:
        "#FFF3E9",
    },

    eyebrow: {
      color: canalDynamicColors.gold,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.7,
    },

    creditTitle: {
      color: canalDynamicColors.text,
      fontSize: 18,
      fontWeight: "900",
    },

    creditText: {
      color: "#6A5141",
      fontSize: 12,
      lineHeight: 19,
    },

    creditStatus: {
      color: "#7C3F1B",
      fontSize: 10,
      fontWeight: "900",
    },

    consentStatusRow: {
      minHeight: 34,
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 8,
    },

    consentStatusLabel: {
      color: "#6A5141",
      fontSize: 11,
      fontWeight: "700",
    },

    consentStatusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: canalDynamicColors.surface,
    },

    creditActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 9,
    },

    creditButton: {
      minHeight: 46,
      flexGrow: 1,
      flexBasis: 150,
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "center",
      gap: 7,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor:
        "#D9B69D",
      borderRadius: 14,
      borderCurve:
        "continuous",
      backgroundColor: canalDynamicColors.surface,
    },

    creditButtonSelected: {
      borderColor:
        "#F47A24",
      backgroundColor:
        "#F47A24",
    },

    declineButtonSelected: {
      borderColor:
        "#D69A91",
      backgroundColor:
        "#FFF0EE",
    },

    creditButtonText: {
      color: "#733A18",
      fontSize: 12,
      fontWeight: "900",
    },

    creditButtonSelectedText: {
      color: "#FFFFFF",
    },

    section: {
      gap: 10,
    },

    sectionHeader: {
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 12,
    },

    sectionTitle: {
      color: canalDynamicColors.text,
      fontSize: 19,
      fontWeight: "900",
    },

    sectionDescription: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      lineHeight: 18,
    },

    sectionCount: {
      color: canalDynamicColors.gold,
      fontSize: 12,
      fontWeight: "900",
      fontVariant: [
        "tabular-nums",
      ],
    },

    contributorList: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },

    contributorCard: {
      minHeight: 64,
      flexGrow: 1,
      flexBasis: 220,
      flexDirection: "row",
      alignItems:
        "center",
      gap: 11,
      padding: 12,
      borderWidth: 1,
      borderColor:
        "#E8E0D8",
      borderRadius: 17,
      borderCurve:
        "continuous",
      backgroundColor: canalDynamicColors.surface,
    },

    avatar: {
      width: 38,
      height: 38,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 19,
      backgroundColor: canalDynamicColors.warningSurface,
    },

    avatarText: {
      color: canalDynamicColors.gold,
      fontSize: 15,
      fontWeight: "900",
    },

    contributorCopy: {
      flex: 1,
      gap: 3,
    },

    contributorName: {
      color: canalDynamicColors.text,
      fontSize: 13,
      fontWeight: "900",
    },

    contributorHandle: {
      color: "#7A716A",
      fontSize: 10,
    },

    emptyItems: {
      padding: 16,
      borderWidth: 1,
      borderColor:
        "#E9E0D8",
      borderRadius: 17,
      borderCurve:
        "continuous",
      backgroundColor: canalDynamicColors.surface,
    },

    emptyItemsText: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      lineHeight: 18,
    },

    itemList: {
      gap: 10,
    },

    itemCard: {
      minHeight: 78,
      flexDirection: "row",
      alignItems:
        "center",
      gap: 12,
      padding: 13,
      borderWidth: 1,
      borderColor:
        "#E9E0D8",
      borderRadius: 18,
      borderCurve:
        "continuous",
      backgroundColor: canalDynamicColors.surface,
    },

    itemCardSelected: {
      borderColor:
        "#F47A24",
      backgroundColor:
        "#FFF5EC",
    },

    position: {
      width: 38,
      height: 38,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 12,
      backgroundColor: canalDynamicColors.warningSurface,
    },

    positionText: {
      color: canalDynamicColors.gold,
      fontSize: 12,
      fontWeight: "900",
      fontVariant: [
        "tabular-nums",
      ],
    },

    itemCopy: {
      flex: 1,
      gap: 4,
    },

    itemTitle: {
      color: canalDynamicColors.text,
      fontSize: 14,
      fontWeight: "900",
    },

    revision: {
      color: "#7B7169",
      fontSize: 10,
      fontVariant: [
        "tabular-nums",
      ],
    },

    voteActionLabel: {
      alignSelf:
        "flex-start",
      color: "#A84B0E",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.2,
    },

    voteActionLabelSelected: {
      color: "#D45D13",
    },

    voteRadio: {
      width: 26,
      height: 26,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderWidth: 2,
      borderColor:
        "#B9AEA5",
      borderRadius: 13,
    },

    voteRadioSelected: {
      borderColor:
        "#F47A24",
    },

    voteDot: {
      width: 13,
      height: 13,
      borderRadius: 7,
      backgroundColor:
        "#F47A24",
    },

    voteNotice: {
      gap: 5,
      padding: 15,
      borderWidth: 1,
      borderColor:
        "#C9D8EC",
      borderRadius: 17,
      borderCurve:
        "continuous",
      backgroundColor:
        "#EFF6FF",
    },

    voteNoticeTitle: {
      color: "#294C76",
      fontSize: 14,
      fontWeight: "900",
    },

    voteNoticeText: {
      color: "#476581",
      fontSize: 12,
      lineHeight: 18,
    },

    privateResults: {
      gap: 6,
      padding: 16,
      borderWidth: 1,
      borderColor:
        "#DDD4CC",
      borderRadius: 18,
      borderCurve:
        "continuous",
      backgroundColor:
        "#F5F1ED",
    },

    privateResultsTitle: {
      color: canalDynamicColors.text,
      fontSize: 15,
      fontWeight: "900",
    },

    privateResultsText: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      lineHeight: 18,
    },

    resultsCard: {
      gap: 10,
      padding: 19,
      borderWidth: 1,
      borderColor:
        "#BBD9C5",
      borderRadius: 22,
      borderCurve:
        "continuous",
      backgroundColor:
        "#EAF7EE",
    },

    resultsEyebrow: {
      color: "#347047",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.7,
    },

    resultsTitle: {
      color: "#193E27",
      fontSize: 23,
      fontWeight: "900",
    },

    totalVotes: {
      color: "#347047",
      fontSize: 13,
      fontWeight: "900",
      fontVariant: [
        "tabular-nums",
      ],
    },

    noVotesText: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      lineHeight: 18,
    },

    resultList: {
      gap: 8,
    },

    resultRow: {
      minHeight: 64,
      flexDirection: "row",
      alignItems:
        "center",
      gap: 10,
      padding: 11,
      borderWidth: 1,
      borderColor:
        "#CFE3D5",
      borderRadius: 15,
      borderCurve:
        "continuous",
      backgroundColor: canalDynamicColors.surface,
    },

    winnerRow: {
      borderColor:
        "#5A9B6D",
      backgroundColor:
        "#F4FFF7",
    },

    resultPosition: {
      width: 32,
      height: 32,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 10,
      backgroundColor:
        "#E6F4EA",
    },

    resultPositionText: {
      color: "#347047",
      fontSize: 11,
      fontWeight: "900",
      fontVariant: [
        "tabular-nums",
      ],
    },

    resultCopy: {
      flex: 1,
      gap: 5,
    },

    resultName: {
      color: canalDynamicColors.text,
      fontSize: 13,
      fontWeight: "900",
    },

    winnerLabel: {
      color: "#347047",
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.7,
    },

    resultMetaRow: {
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 8,
    },

    resultPercent: {
      color: "#55705E",
      fontSize: 9,
      fontWeight: "800",
      fontVariant: [
        "tabular-nums",
      ],
    },

    resultTrack: {
      height: 5,
      overflow: "hidden",
      borderRadius: 3,
      backgroundColor:
        "#E2EEE6",
    },

    resultFill: {
      height: "100%",
      minWidth: 0,
      borderRadius: 3,
      backgroundColor:
        "#5A9B6D",
    },

    resultCount: {
      minWidth: 34,
      color: "#347047",
      fontSize: 17,
      fontWeight: "900",
      fontVariant: [
        "tabular-nums",
      ],
      textAlign: "right",
    },

    privacyText: {
      color: canalDynamicColors.muted,
      fontSize: 10,
      lineHeight: 16,
    },

    disabledButton: {
      opacity: 0.45,
    },

    pressed: {
      opacity: 0.7,
    },
  });
