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
            requestEpoch.current ===
              epoch &&
            activeUserIdRef.current ===
              accountUserId &&
            accountUserId ===
              props.expectedUserId;

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

  const ownReleases =
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

  const accessibleBallots =
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
          accessibilityLabel="Go back"
          accessibilityRole="button"
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
          accessibilityLabel="Create a new release"
          accessibilityRole="button"
          onPress={() =>
            router.push(
              "/releases/new" as never,
            )
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
                onPress={() =>
                  router.push(
                    "/releases/new" as never,
                  )
                }
                style={({
                  pressed,
                }) => [
                  styles.primaryButton,
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

    pressed: {
      opacity: 0.7,
    },
  });
