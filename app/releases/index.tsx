import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  router,
  useFocusEffect,
} from "expo-router";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  CreatorReleaseCard,
} from "../../components/CreatorReleaseCard";

import {
  RecoveryNotice,
} from "../../components/recovery-notice";

import {
  useReconnectReload,
} from "../../hooks/use-reconnect-reload";

import {
  captureCreatorReleaseAccount,
  listCreatorReleases,
} from "../../lib/creator-releases";

import type {
  CreatorRelease,
} from "../../lib/creator-releases";

import {
  CREATOR_RELEASE_BROWSE_FILTERS,
  creatorReleaseRequestCanCommit,
  filterCreatorReleases,
  shouldDiscardCreatorReleaseSnapshot,
} from "../../lib/creator-release-interface";

import type {
  CreatorReleaseBrowseFilter,
} from "../../lib/creator-release-interface";

import {
  classifyRecoveryIssue,
} from "../../lib/recovery-issue";

import type {
  RecoveryIssue,
} from "../../lib/recovery-issue";

import type {
  ConnectivityStatus,
} from "../../lib/connectivity";

import {
  useAuth,
} from "../../providers/auth-provider";

import {
  useConnectivity,
} from "../../providers/connectivity-provider";

type ReleaseErrorShape = {
  kind?: unknown;
  message?: unknown;
};

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
        "Release ballots are offline",
      message:
        "Reconnect to load release ballots. Canal did not queue an action.",
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
        "Canal discarded a release response from the previous account. Load again for the current account.",
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
        "Ballot unavailable",
      message:
        message ||
        "A relationship block prevents access to this release ballot.",
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
        "Release unavailable",
      message:
        message ||
        "This release is private, missing, or no longer available to this account.",
      action: "retry",
      actionLabel:
        "Try again",
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

function goBack(): void {
  if (
    router.canGoBack()
  ) {
    router.back();

    return;
  }

  router.replace(
    "/(tabs)/profile" as never,
  );
}

export default function CreatorReleasesScreen() {
  const {
    user,
  } = useAuth();

  return (
    <CreatorReleasesContent
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

function CreatorReleasesContent(
  props: {
    expectedUserId: string;
  },
) {
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
    releases,
    setReleases,
  ] =
    useState<
      CreatorRelease[]
    >([]);

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    loadError,
    setLoadError,
  ] =
    useState<unknown>(
      null,
    );

  const [
    browseFilter,
    setBrowseFilter,
  ] =
    useState<CreatorReleaseBrowseFilter>(
      "all",
    );

  const requestEpoch =
    useRef(0);

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

  const loadReleases =
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
            });

        setIsLoading(
          true,
        );
        setLoadError(
          null,
        );

        try {
          if (
            !props.expectedUserId
          ) {
            throw taggedError(
              "account-changed",
              "Sign in to load release ballots.",
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

          const nextReleases =
            await listCreatorReleases({
              account,
            });

          if (
            !isCurrent(
              account.userId,
            )
          ) {
            return false;
          }

          setReleases(
            nextReleases,
          );

          return true;
        } catch (error) {
          if (
            requestEpoch.current !==
              epoch ||
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
            setReleases(
              [],
            );
          }

          setLoadError(
            error,
          );

          return false;
        } finally {
          if (
            requestEpoch.current ===
              epoch &&
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
      ],
    );

  useFocusEffect(
    useCallback(
      () => {
        void loadReleases();

        return () => {
          requestEpoch.current +=
            1;
        };
      },
      [
        loadReleases,
      ],
    ),
  );

  useReconnectReload(
    useCallback(
      async (): Promise<void> => {
        await loadReleases();
      },
      [
        loadReleases,
      ],
    ),
  );

  const retry =
    useCallback(
      async (): Promise<void> => {
        const checkedStatus =
          await refreshConnectivity();

        await loadReleases(
          checkedStatus,
        );
      },
      [
        loadReleases,
        refreshConnectivity,
      ],
    );

  const allOwnReleases =
    useMemo(
      () =>
        releases.filter(
          (release) =>
            release.ownerId ===
            props.expectedUserId,
        ),
      [
        props.expectedUserId,
        releases,
      ],
    );

  const allAccessibleBallots =
    useMemo(
      () =>
        releases.filter(
          (release) =>
            release.ownerId !==
            props.expectedUserId,
        ),
      [
        props.expectedUserId,
        releases,
      ],
    );

  const ownReleases =
    useMemo(
      () =>
        filterCreatorReleases(
          allOwnReleases,
          browseFilter,
        ),
      [
        allOwnReleases,
        browseFilter,
      ],
    );

  const accessibleBallots =
    useMemo(
      () =>
        filterCreatorReleases(
          allAccessibleBallots,
          browseFilter,
        ),
      [
        allAccessibleBallots,
        browseFilter,
      ],
    );

  const openBallotCount =
    useMemo(
      () =>
        releases.filter(
          (release) =>
            release.status ===
            "open",
        ).length,
      [
        releases,
      ],
    );

  const closedBallotCount =
    useMemo(
      () =>
        releases.filter(
          (release) =>
            release.status ===
            "closed",
        ).length,
      [
        releases,
      ],
    );

  const filteredReleaseCount =
    ownReleases.length +
    accessibleBallots.length;

  const issue =
    loadError
      ? releaseIssue(
          loadError,
          connectivityStatus,
        )
      : null;

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
          Releases
        </Text>

        <Pressable
          accessibilityHint="Starts a draft from one of your public Scene collections"
          accessibilityLabel="Create a new release"
          accessibilityRole="button"
          accessibilityState={{
            disabled:
              connectivityStatus ===
              "offline",
          }}
          disabled={
            connectivityStatus ===
            "offline"
          }
          hitSlop={8}
          onPress={() =>
            router.push(
              "/releases/new" as never,
            )
          }
          style={({
            pressed,
          }) => [
            styles.headerButton,
            connectivityStatus ===
              "offline" &&
              styles.disabledButton,
            pressed &&
              styles.pressed,
          ]}
        >
          <Text
            style={
              styles.addText
            }
          >
            +
          </Text>
        </Pressable>
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
          <View
            style={
              styles.hero
            }
          >
            <Text
              style={
                styles.eyebrow
              }
            >
              CREATOR RELEASE BALLOTS
            </Text>

            <Text
              selectable
              style={
                styles.title
              }
            >
              Choose a favorite Scene.
            </Text>

            <Text
              selectable
              style={
                styles.subtitle
              }
            >
              Open a release from a public Scene collection, invite eligible contributors to choose their credit, and keep ballot choices private.
            </Text>
          </View>

          {releases.length >
          0 ? (
            <>
              <View
                accessibilityLabel={`${allOwnReleases.length} releases created by you, ${openBallotCount} open ballots, ${closedBallotCount} closed results`}
                style={
                  styles.summaryRow
                }
              >
                <View
                  style={
                    styles.summaryMetric
                  }
                >
                  <Text
                    style={
                      styles.summaryValue
                    }
                  >
                    {
                      allOwnReleases.length
                    }
                  </Text>

                  <Text
                    style={
                      styles.summaryLabel
                    }
                  >
                    YOURS
                  </Text>
                </View>

                <View
                  style={
                    styles.summaryMetric
                  }
                >
                  <Text
                    style={
                      styles.summaryValue
                    }
                  >
                    {
                      openBallotCount
                    }
                  </Text>

                  <Text
                    style={
                      styles.summaryLabel
                    }
                  >
                    OPEN
                  </Text>
                </View>

                <View
                  style={
                    styles.summaryMetric
                  }
                >
                  <Text
                    style={
                      styles.summaryValue
                    }
                  >
                    {
                      closedBallotCount
                    }
                  </Text>

                  <Text
                    style={
                      styles.summaryLabel
                    }
                  >
                    RESULTS
                  </Text>
                </View>
              </View>

              <View
                accessibilityLabel="Filter release ballots"
                accessibilityRole="radiogroup"
                style={
                  styles.filterRow
                }
              >
                {CREATOR_RELEASE_BROWSE_FILTERS.map(
                  (filter) => {
                    const selected =
                      browseFilter ===
                      filter;

                    const label =
                      filter ===
                        "all"
                        ? "All"
                        : filter ===
                            "open"
                          ? "Voting open"
                          : "Results";

                    return (
                      <Pressable
                        accessibilityLabel={`Show ${label.toLowerCase()} releases`}
                        accessibilityRole="radio"
                        accessibilityState={{
                          checked:
                            selected,
                        }}
                        key={
                          filter
                        }
                        onPress={() => {
                          setBrowseFilter(
                            filter,
                          );
                        }}
                        style={({
                          pressed,
                        }) => [
                          styles.filterButton,
                          selected &&
                            styles.filterButtonSelected,
                          pressed &&
                            styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.filterButtonText,
                            selected &&
                              styles.filterButtonTextSelected,
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  },
                )}
              </View>
            </>
          ) : null}

          {issue ? (
            <>
              {releases.length >
              0 ? (
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
                    Showing the last loaded release list. Refresh before acting on changed access or ballot status.
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
          releases.length >
            0 &&
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
                Refreshing release access and status…
              </Text>
            </View>
          ) : null}

          {connectivityStatus ===
            "offline" &&
          releases.length >
            0 &&
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
                Offline. Showing the last loaded list; open a ballot again after reconnecting to confirm current access.
              </Text>
            </View>
          ) : null}

          {isLoading &&
          releases.length ===
            0 ? (
            <View
              accessibilityLabel="Loading release ballots"
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
                Loading release ballots…
              </Text>
            </View>
          ) : null}

          {!isLoading &&
          releases.length >
            0 &&
          filteredReleaseCount ===
            0 &&
          !issue ? (
            <View
              style={
                styles.filteredEmptyCard
              }
            >
              <Text
                selectable
                style={
                  styles.filteredEmptyTitle
                }
              >
                Nothing in this view
              </Text>

              <Text
                selectable
                style={
                  styles.filteredEmptyText
                }
              >
                {browseFilter ===
                  "open"
                  ? "No accessible ballot is currently open for voting."
                  : "No closed release results are available yet."}
              </Text>

              <Pressable
                accessibilityLabel="Show all release ballots"
                accessibilityRole="button"
                onPress={() => {
                  setBrowseFilter(
                    "all",
                  );
                }}
                style={
                  styles.showAllButton
                }
              >
                <Text
                  style={
                    styles.showAllButtonText
                  }
                >
                  Show all
                </Text>
              </Pressable>
            </View>
          ) : null}

          {!isLoading &&
          releases.length ===
            0 &&
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
                No releases yet
              </Text>

              <Text
                selectable
                style={
                  styles.emptyText
                }
              >
                Start with one of your public, non-empty Scene collections. Opening the ballot will freeze its ordered Scenes and revisions.
              </Text>

              <Pressable
                accessibilityLabel="Create your first release"
                accessibilityRole="button"
                accessibilityState={{
                  disabled:
                    connectivityStatus ===
                    "offline",
                }}
                disabled={
                  connectivityStatus ===
                  "offline"
                }
                onPress={() =>
                  router.push(
                    "/releases/new" as never,
                  )
                }
                style={({
                  pressed,
                }) => [
                  styles.primaryButton,
                  connectivityStatus ===
                    "offline" &&
                    styles.disabledButton,
                  pressed &&
                    styles.pressed,
                ]}
              >
                <Text
                  style={
                    styles.primaryButtonText
                  }
                >
                  New Release
                </Text>
              </Pressable>
            </View>
          ) : null}

          {ownReleases.length >
          0 ? (
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
                  Your releases
                </Text>

                <Text
                  style={
                    styles.sectionCount
                  }
                >
                  {
                    ownReleases.length
                  }
                </Text>
              </View>

              <View
                style={
                  styles.releaseList
                }
              >
                {ownReleases.map(
                  (release) => (
                    <CreatorReleaseCard
                      isOwner
                      key={
                        release.id
                      }
                      release={
                        release
                      }
                    />
                  ),
                )}
              </View>
            </View>
          ) : null}

          {accessibleBallots.length >
          0 ? (
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
                  Ballots you can access
                </Text>

                <Text
                  style={
                    styles.sectionCount
                  }
                >
                  {
                    accessibleBallots.length
                  }
                </Text>
              </View>

              <Text
                selectable
                style={
                  styles.sectionDescription
                }
              >
                You may be an eligible contributor or an authenticated listener. Access can change if an account relationship changes.
              </Text>

              <View
                style={
                  styles.releaseList
                }
              >
                {accessibleBallots.map(
                  (release) => (
                    <CreatorReleaseCard
                      isOwner={
                        false
                      }
                      key={
                        release.id
                      }
                      release={
                        release
                      }
                    />
                  ),
                )}
              </View>
            </View>
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
      backgroundColor:
        "#FFF9F4",
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
      backgroundColor:
        "#FFFFFF",
    },

    backText: {
      color: "#1B1B1B",
      fontSize: 34,
      lineHeight: 36,
    },

    addText: {
      color: "#F47A24",
      fontSize: 28,
      fontWeight: "700",
      lineHeight: 30,
    },

    headerTitle: {
      color: "#1B1B1B",
      fontSize: 16,
      fontWeight: "900",
    },

    content: {
      flexGrow: 1,
      paddingHorizontal: 20,
      paddingBottom: 48,
    },

    column: {
      width: "100%",
      maxWidth: 720,
      alignSelf: "center",
      gap: 18,
    },

    hero: {
      gap: 8,
      padding: 20,
      borderRadius: 24,
      borderCurve:
        "continuous",
      backgroundColor:
        "#2B1710",
    },

    eyebrow: {
      color: "#FFB781",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.8,
    },

    title: {
      color: "#FFFFFF",
      fontSize: 28,
      fontWeight: "900",
      lineHeight: 33,
    },

    subtitle: {
      color: "#E8D9D0",
      fontSize: 13,
      lineHeight: 20,
    },

    summaryRow: {
      flexDirection: "row",
      gap: 10,
    },

    summaryMetric: {
      minHeight: 74,
      flex: 1,
      alignItems:
        "center",
      justifyContent:
        "center",
      gap: 3,
      padding: 10,
      borderWidth: 1,
      borderColor:
        "#E8DED5",
      borderRadius: 18,
      borderCurve:
        "continuous",
      backgroundColor:
        "#FFFFFF",
    },

    summaryValue: {
      color: "#2B211B",
      fontSize: 22,
      fontWeight: "900",
      fontVariant: [
        "tabular-nums",
      ],
    },

    summaryLabel: {
      color: "#8B8179",
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.6,
    },

    filterRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      padding: 4,
      borderRadius: 17,
      borderCurve:
        "continuous",
      backgroundColor:
        "#EFE8E1",
    },

    filterButton: {
      minHeight: 48,
      flexGrow: 1,
      flexBasis: 96,
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingHorizontal: 13,
      borderRadius: 13,
      borderCurve:
        "continuous",
    },

    filterButtonSelected: {
      backgroundColor:
        "#FFFFFF",
    },

    filterButtonText: {
      color: "#776E67",
      fontSize: 11,
      fontWeight: "800",
    },

    filterButtonTextSelected: {
      color: "#B9500B",
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
      minHeight: 180,
      alignItems:
        "center",
      justifyContent:
        "center",
      gap: 12,
    },

    loadingText: {
      color: "#716861",
      fontSize: 13,
    },

    emptyCard: {
      alignItems:
        "flex-start",
      gap: 12,
      padding: 22,
      borderWidth: 1,
      borderColor:
        "#EEE2D8",
      borderRadius: 24,
      borderCurve:
        "continuous",
      backgroundColor:
        "#FFFFFF",
    },

    emptyTitle: {
      color: "#1B1B1B",
      fontSize: 22,
      fontWeight: "900",
    },

    emptyText: {
      color: "#6B625B",
      fontSize: 13,
      lineHeight: 20,
    },

    filteredEmptyCard: {
      alignItems:
        "flex-start",
      gap: 9,
      padding: 18,
      borderWidth: 1,
      borderColor:
        "#E8DED5",
      borderRadius: 20,
      borderCurve:
        "continuous",
      backgroundColor:
        "#FFFFFF",
    },

    filteredEmptyTitle: {
      color: "#2B211B",
      fontSize: 17,
      fontWeight: "900",
    },

    filteredEmptyText: {
      color: "#71675F",
      fontSize: 12,
      lineHeight: 18,
    },

    showAllButton: {
      minHeight: 44,
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingHorizontal: 16,
      borderRadius: 14,
      borderCurve:
        "continuous",
      backgroundColor:
        "#FFF0E5",
    },

    showAllButtonText: {
      color: "#A84B0E",
      fontSize: 12,
      fontWeight: "900",
    },

    primaryButton: {
      minHeight: 48,
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingHorizontal: 20,
      borderRadius: 15,
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

    section: {
      gap: 12,
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
      color: "#1B1B1B",
      fontSize: 19,
      fontWeight: "900",
    },

    sectionCount: {
      minWidth: 26,
      color: "#F47A24",
      fontSize: 12,
      fontWeight: "900",
      fontVariant: [
        "tabular-nums",
      ],
      textAlign: "right",
    },

    sectionDescription: {
      color: "#746B64",
      fontSize: 12,
      lineHeight: 18,
    },

    releaseList: {
      gap: 12,
    },

    disabledButton: {
      opacity: 0.42,
    },

    pressed: {
      opacity: 0.7,
    },
  });
