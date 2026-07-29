import * as Haptics from "expo-haptics";
import {
  router,
  useFocusEffect,
} from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  RecoveryNotice,
} from "../../components/recovery-notice";
import {
  useReconnectReload,
} from "../../hooks/use-reconnect-reload";
import {
  getCurrentLiveStageTrack,
  LiveStage,
  readLiveStages,
} from "../../lib/live-stages";
import {
  classifyRecoveryIssue,
} from "../../lib/recovery-issue";
import {
  useAuth,
} from "../../providers/auth-provider";
import {
  useConnectivity,
} from "../../providers/connectivity-provider";

function getStageKind(
  stage: LiveStage,
): LiveStage["stageKind"] {
  return stage.stageKind;
}

function StageCard(
  props: {
    stage: LiveStage;
  },
) {
  const currentTrack =
    getCurrentLiveStageTrack(
      props.stage,
    );

  const stageKind =
    getStageKind(
      props.stage,
    );

  const provenanceLabel =
    stageKind ===
    "canal"
      ? "Canal Stage"
      : stageKind ===
          "verified"
        ? "Verified creator Stage"
        : "Community Stage";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        `Open ${props.stage.name}, ${provenanceLabel}`
      }
      onPress={() => {
        if (
          process.env
            .EXPO_OS ===
          "ios"
        ) {
          void Haptics
            .selectionAsync();
        }

        router.push({
          pathname:
            "/live-stage/[stageId]",
          params: {
            stageId:
              props.stage.id,
          },
        });
      }}
      style={({ pressed }) => [
        styles.stageCard,
        pressed &&
          styles.pressed,
      ]}
    >
      <View
        style={
          styles.stageTopRow
        }
      >
        <View
          style={
            styles.livePill
          }
        >
          <View
            style={
              styles.liveDot
            }
          />

          <Text
            style={
              styles.livePillText
            }
          >
            LIVE
          </Text>
        </View>

        {stageKind !==
        "community" ? (
          <View
            accessibilityLabel={
              provenanceLabel
            }
            style={[
              styles.trustPill,
              stageKind ===
                "canal"
                ? styles.trustPillCanal
                : styles.trustPillVerified,
            ]}
          >
            <Text
              style={[
                styles.trustPillText,
                stageKind ===
                  "canal"
                  ? styles.trustPillTextCanal
                  : styles.trustPillTextVerified,
              ]}
            >
              {stageKind ===
              "canal"
                ? "CANAL"
                : "VERIFIED"}
            </Text>
          </View>
        ) : null}

        <Text
          style={
            styles.stageAudience
          }
        >
          {props.stage
            .participantCount}{" "}
          in room
        </Text>
      </View>

      <Text
        numberOfLines={2}
        style={
          styles.stageName
        }
      >
        {props.stage.name}
      </Text>

      <Text
        numberOfLines={1}
        style={
          styles.stageHost
        }
      >
        @{props.stage
          .hostUsername} ·{" "}
        {props.stage.activity}
      </Text>

      <View
        style={
          styles.nowPlaying
        }
      >
        <View
          style={
            styles.albumTile
          }
        >
          <Text
            style={
              styles.albumTileText
            }
          >
            ♪
          </Text>
        </View>

        <View
          style={
            styles.trackCopy
          }
        >
          <Text
            style={
              styles.trackEyebrow
            }
          >
            NOW PLAYING
          </Text>

          <Text
            numberOfLines={1}
            style={
              styles.trackTitle
            }
          >
            {currentTrack?.title ??
              "The queue is ready"}
          </Text>

          <Text
            numberOfLines={1}
            style={
              styles.trackArtist
            }
          >
            {currentTrack?.artist ??
              `${props.stage.tracks.length} tracks`}
          </Text>
        </View>

        <Text
          accessibilityElementsHidden
          style={
            styles.cardArrow
          }
        >
          ›
        </Text>
      </View>

      {props.stage
        .membershipRole ? (
        <Text
          style={
            styles.memberLabel
          }
        >
          YOU’RE IN ·{" "}
          {props.stage
            .membershipRole
            .toUpperCase()}
        </Text>
      ) : null}
    </Pressable>
  );
}

export default function LiveHubScreen() {
  const {
    configured,
    profile,
    user,
  } = useAuth();

  const {
    refresh:
      refreshConnectivity,
    status:
      connectivityStatus,
  } = useConnectivity();

  const accountKey =
    user?.id ??
    (
      configured
        ? "configured:signed-out"
        : `local:${profile?.createdAt ?? "default"}:${profile?.handle ?? ""}`
    );

  const [
    stages,
    setStages,
  ] = useState<
    LiveStage[]
  >([]);

  const [
    stagesAccountKey,
    setStagesAccountKey,
  ] = useState(
    accountKey,
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const accountKeyRef =
    useRef(
      accountKey,
    );

  const requestIdRef =
    useRef(0);

  const cacheRef =
    useRef<{
      accountKey: string;
      stages: LiveStage[];
    }>({
      accountKey,
      stages: [],
    });

  accountKeyRef.current =
    accountKey;

  const load =
    useCallback(
      async (
        refresh = false,
      ) => {
        const requestId =
          requestIdRef.current +
          1;

        requestIdRef.current =
          requestId;

        const requestedAccountKey =
          accountKey;

        const hasCachedStages =
          cacheRef.current
            .accountKey ===
            requestedAccountKey &&
          cacheRef.current
            .stages.length >
            0;

        if (refresh) {
          setRefreshing(
            true,
          );
        } else if (
          !hasCachedStages
        ) {
          setLoading(
            true,
          );
        }

        try {
          const nextStages =
            await readLiveStages();

          if (
            requestId !==
              requestIdRef.current ||
            requestedAccountKey !==
              accountKeyRef.current
          ) {
            return;
          }

          cacheRef.current = {
            accountKey:
              requestedAccountKey,
            stages:
              nextStages,
          };

          setStages(
            nextStages,
          );
          setStagesAccountKey(
            requestedAccountKey,
          );
          setError("");
        } catch (
          loadError
        ) {
          if (
            requestId !==
              requestIdRef.current ||
            requestedAccountKey !==
              accountKeyRef.current
          ) {
            return;
          }

          setError(
            loadError instanceof
              Error
              ? loadError.message
              : "Canal could not load Live Stages.",
          );
        } finally {
          if (
            requestId !==
              requestIdRef.current ||
            requestedAccountKey !==
              accountKeyRef.current
          ) {
            return;
          }

          setLoading(
            false,
          );
          setRefreshing(
            false,
          );
        }
      },
      [
        accountKey,
      ],
    );

  useEffect(() => {
    requestIdRef.current +=
      1;
    setError("");
    setLoading(
      true,
    );
    setRefreshing(
      false,
    );
  }, [
    accountKey,
  ]);

  useFocusEffect(
    useCallback(() => {
      void load();

      return () => {
        requestIdRef.current +=
          1;
      };
    }, [
      load,
    ]),
  );

  useReconnectReload(
    load,
  );

  const visibleStages =
    useMemo(
      () =>
        stagesAccountKey ===
        accountKey
          ? stages
          : [],
      [
        accountKey,
        stages,
        stagesAccountKey,
      ],
    );

  const liveStages =
    useMemo(
      () =>
        visibleStages.filter(
          (stage) =>
            stage.status ===
            "live",
        ),
      [
        visibleStages,
      ],
    );

  const myStages =
    liveStages.filter(
      (stage) =>
        Boolean(
          stage
            .membershipRole,
        ),
    );

  const discoverStages =
    liveStages.filter(
      (stage) =>
        !stage
          .membershipRole &&
        stage.visibility ===
          "public",
    );

  const canalStages =
    discoverStages.filter(
      (stage) =>
        getStageKind(
          stage,
        ) ===
        "canal",
    );

  const verifiedStages =
    discoverStages.filter(
      (stage) =>
        getStageKind(
          stage,
        ) ===
        "verified",
    );

  const communityStages =
    discoverStages.filter(
      (stage) =>
        getStageKind(
          stage,
        ) ===
        "community",
    );

  const discoverSections = [
    {
      key: "canal",
      title:
        "Canal live",
      stages:
        canalStages,
    },
    {
      key: "verified",
      title:
        "Verified creators",
      stages:
        verifiedStages,
    },
    {
      key: "community",
      title:
        "Community live",
      stages:
        communityStages,
    },
  ] as const;

  const recoveryIssue =
    useMemo(
      () => {
        if (error) {
          return classifyRecoveryIssue(
            error,
            {
              service:
                "canal",
              connectivityStatus,
            },
          );
        }

        if (
          configured &&
          connectivityStatus ===
          "offline"
        ) {
          return classifyRecoveryIssue(
            new Error(
              "Canal Live is offline.",
            ),
            {
              service:
                "canal",
              connectivityStatus,
            },
          );
        }

        return null;
      },
      [
        configured,
        connectivityStatus,
        error,
      ],
    );

  const recover =
    useCallback(
      async (): Promise<void> => {
        if (
          recoveryIssue
            ?.action ===
          "sign-in"
        ) {
          router.push(
            "/login" as never,
          );

          return;
        }

        const nextStatus =
          await refreshConnectivity();

        if (
          nextStatus !==
          "offline"
        ) {
          await load(
            liveStages.length ===
              0,
          );
        }
      },
      [
        liveStages.length,
        load,
        recoveryIssue,
        refreshConnectivity,
      ],
    );

  return (
    <SafeAreaView
      style={styles.screen}
      edges={[
        "top",
        "left",
        "right",
      ]}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={
              refreshing
            }
            onRefresh={() => {
              void load(true);
            }}
            tintColor="#F47A24"
          />
        }
        contentContainerStyle={
          styles.content
        }
      >
        <View
          style={
            styles.headerRow
          }
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close Live Stages"
            onPress={() => {
              if (
                router.canGoBack()
              ) {
                router.back();
              } else {
                router.replace(
                  "/(tabs)",
                );
              }
            }}
            style={({
              pressed,
            }) => [
              styles.closeButton,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.closeText
              }
            >
              ‹
            </Text>
          </Pressable>

          <View
            style={
              styles.headerCopy
            }
          >
            <Text
              selectable
              style={
                styles.kicker
              }
            >
              CANAL LIVE
            </Text>

            <Text
              selectable
              style={
                styles.heading
              }
            >
              Stages
            </Text>
          </View>

          <View
            style={
              styles.headerSpacer
            }
          />
        </View>

        <Text
          selectable
          style={styles.intro}
        >
          Shared Scene queues,
          live room updates, and
          conversation in one
          place.
        </Text>

        <View
          style={
            styles.actions
          }
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              router.push(
                "/create-stage",
              );
            }}
            style={({
              pressed,
            }) => [
              styles.primaryAction,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.primaryActionIcon
              }
            >
              ◉
            </Text>

            <Text
              style={
                styles.primaryActionText
              }
            >
              Start a Stage
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              router.push(
                "/join-stage",
              );
            }}
            style={({
              pressed,
            }) => [
              styles.secondaryAction,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.secondaryActionText
              }
            >
              Join with code
            </Text>
          </Pressable>
        </View>

        {recoveryIssue ? (
          <RecoveryNotice
            busy={
              loading ||
              refreshing
            }
            issue={
              recoveryIssue
            }
            onAction={
              recover
            }
          />
        ) : null}

        {loading &&
        liveStages.length ===
          0 &&
        !recoveryIssue ? (
          <View
            style={
              styles.loading
            }
          >
            <ActivityIndicator
              size="large"
              color="#F47A24"
            />

            <Text
              style={
                styles.loadingText
              }
            >
              Tuning into Canal
              Live…
            </Text>
          </View>
        ) : liveStages.length ===
          0 ? (
          recoveryIssue ? null : (
            <View
              style={
                styles.empty
              }
            >
              <View
                style={
                  styles.emptyIcon
                }
              >
                <Text
                  style={
                    styles.emptyIconText
                  }
                >
                  ◌
                </Text>
              </View>

              <Text
                selectable
                style={
                  styles.emptyTitle
                }
              >
                The room is quiet.
              </Text>

              <Text
                selectable
                style={
                  styles.emptyText
                }
              >
                Start the first Stage
                from one of your saved
                Scenes, then invite
                people with its code.
              </Text>
            </View>
          )
        ) : (
          <>
            {myStages.length >
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
                    selectable
                    style={
                      styles.sectionTitle
                    }
                  >
                    Your rooms
                  </Text>

                  <Text
                    style={
                      styles.sectionCount
                    }
                  >
                    {
                      myStages.length
                    }
                  </Text>
                </View>

                {myStages.map(
                  (stage) => (
                    <StageCard
                      key={
                        stage.id
                      }
                      stage={
                        stage
                      }
                    />
                  ),
                )}
              </View>
            ) : null}

            {discoverSections.map(
              (section) =>
                section.stages
                  .length > 0 ? (
                  <View
                    key={
                      section.key
                    }
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
                        selectable
                        style={
                          styles.sectionTitle
                        }
                      >
                        {section.title}
                      </Text>

                      <Text
                        accessibilityLabel={`${section.stages.length} Stages`}
                        style={
                          styles.sectionCount
                        }
                      >
                        {
                          section
                            .stages
                            .length
                        }
                      </Text>
                    </View>

                    {section.stages.map(
                      (stage) => (
                        <StageCard
                          key={
                            stage.id
                          }
                          stage={
                            stage
                          }
                        />
                      ),
                    )}
                  </View>
                ) : null,
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor:
        "#100D0B",
    },

    content: {
      paddingHorizontal: 20,
      paddingBottom: 40,
      gap: 18,
    },

    headerRow: {
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
    },

    closeButton: {
      width: 46,
      height: 46,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 23,
      backgroundColor:
        "#211A16",
    },

    closeText: {
      color: "#FFFFFF",
      fontSize: 34,
      lineHeight: 36,
      fontWeight: "300",
      marginTop: -3,
    },

    headerCopy: {
      alignItems: "center",
      gap: 1,
    },

    headerSpacer: {
      width: 46,
    },

    kicker: {
      color: "#FF9650",
      fontSize: 10,
      lineHeight: 13,
      fontWeight: "900",
      letterSpacing: 1.4,
    },

    heading: {
      color: "#FFFFFF",
      fontSize: 24,
      lineHeight: 29,
      fontWeight: "900",
    },

    intro: {
      color: "#B7AAA1",
      fontSize: 16,
      lineHeight: 23,
      textAlign: "center",
      paddingHorizontal: 20,
    },

    actions: {
      flexDirection: "row",
      gap: 10,
    },

    primaryAction: {
      flex: 1,
      minHeight: 54,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 18,
      borderCurve: "continuous",
      backgroundColor:
        "#F47A24",
    },

    primaryActionIcon: {
      color: "#FFFFFF",
      fontSize: 17,
      fontWeight: "900",
    },

    primaryActionText: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "900",
    },

    secondaryAction: {
      minHeight: 54,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: "#3B302A",
      borderRadius: 18,
      borderCurve: "continuous",
      backgroundColor:
        "#211A16",
    },

    secondaryActionText: {
      color: "#F5EAE2",
      fontSize: 14,
      fontWeight: "800",
    },

    loading: {
      minHeight: 260,
      alignItems: "center",
      justifyContent: "center",
      gap: 14,
    },

    loadingText: {
      color: "#968A82",
      fontSize: 14,
      fontWeight: "700",
    },

    empty: {
      minHeight: 300,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      padding: 28,
      borderWidth: 1,
      borderColor: "#2C2420",
      borderRadius: 26,
      borderCurve: "continuous",
      backgroundColor:
        "#181310",
    },

    emptyIcon: {
      width: 64,
      height: 64,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 22,
      borderCurve: "continuous",
      backgroundColor:
        "#2C2018",
    },

    emptyIconText: {
      color: "#FF8C3D",
      fontSize: 33,
      fontWeight: "800",
    },

    emptyTitle: {
      color: "#FFFFFF",
      fontSize: 22,
      fontWeight: "900",
      textAlign: "center",
    },

    emptyText: {
      maxWidth: 290,
      color: "#A99C94",
      fontSize: 15,
      lineHeight: 22,
      textAlign: "center",
    },

    section: {
      gap: 12,
    },

    sectionHeader: {
      minHeight: 34,
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      paddingHorizontal: 2,
    },

    sectionTitle: {
      color: "#F9F2ED",
      fontSize: 19,
      fontWeight: "900",
    },

    sectionCount: {
      minWidth: 28,
      color: "#FF9A50",
      fontSize: 14,
      fontWeight: "900",
      fontVariant: [
        "tabular-nums",
      ],
      textAlign: "right",
    },

    stageCard: {
      gap: 12,
      padding: 18,
      borderWidth: 1,
      borderColor: "#312722",
      borderRadius: 24,
      borderCurve: "continuous",
      backgroundColor:
        "#1A1512",
      boxShadow:
        "0 12px 28px rgba(0, 0, 0, 0.18)",
    },

    stageTopRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
    },

    livePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor:
        "#3B1D14",
    },

    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor:
        "#FF663D",
    },

    livePillText: {
      color: "#FF8E68",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1,
    },

    trustPill: {
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
    },

    trustPillCanal: {
      borderColor:
        "#F47A24",
      backgroundColor:
        "#321D10",
    },

    trustPillVerified: {
      borderColor:
        "#4E7D9A",
      backgroundColor:
        "#162732",
    },

    trustPillText: {
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.8,
    },

    trustPillTextCanal: {
      color: "#FFAA6F",
    },

    trustPillTextVerified: {
      color: "#9FD8F8",
    },

    stageAudience: {
      marginLeft: "auto",
      color: "#978B84",
      fontSize: 12,
      fontWeight: "700",
      fontVariant: [
        "tabular-nums",
      ],
    },

    stageName: {
      color: "#FFFFFF",
      fontSize: 24,
      lineHeight: 28,
      fontWeight: "900",
      letterSpacing: -0.4,
    },

    stageHost: {
      color: "#AFA198",
      fontSize: 13,
      lineHeight: 18,
    },

    nowPlaying: {
      minHeight: 68,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      padding: 10,
      borderRadius: 18,
      borderCurve: "continuous",
      backgroundColor:
        "#27201C",
    },

    albumTile: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
      borderCurve: "continuous",
      backgroundColor:
        "#F47A24",
    },

    albumTileText: {
      color: "#FFFFFF",
      fontSize: 24,
      fontWeight: "900",
    },

    trackCopy: {
      flex: 1,
      gap: 1,
    },

    trackEyebrow: {
      color: "#E18142",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1,
    },

    trackTitle: {
      color: "#F8F0EA",
      fontSize: 15,
      fontWeight: "900",
    },

    trackArtist: {
      color: "#9E9188",
      fontSize: 12,
    },

    cardArrow: {
      color: "#7E7168",
      fontSize: 26,
      fontWeight: "300",
    },

    memberLabel: {
      color: "#F39A60",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1,
    },

    pressed: {
      opacity: 0.7,
      transform: [
        {
          scale: 0.99,
        },
      ],
    },
  });
