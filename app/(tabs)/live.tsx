import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
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
  TextInput,
  View,
} from "react-native";
import {
  SafeAreaView,
} from "react-native-safe-area-context";

import { canalDynamicColors } from "../../theme/canal-dynamic-colors";

import {
  RecoveryNotice,
} from "../../components/recovery-notice";
import { VerifiedAccountBadge } from "../../components/verified-account-badge";
import { ProfileAvatar } from "../../components/profile-avatar";
import {
  useReconnectReload,
} from "../../hooks/use-reconnect-reload";
import {
  getCurrentLiveStageTrack,
  LiveStage,
  readHostedLiveStages,
  readLiveStages,
} from "../../lib/live-stages";
import {
  classifyRecoveryIssue,
} from "../../lib/recovery-issue";
import {
  addSpotifyArtworkToLiveStage,
} from "../../lib/spotify-scene-artwork";
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

          <View style={styles.stageHostRow}>
            <ProfileAvatar
              avatarUrl={props.stage.hostAvatarUrl}
              displayName={props.stage.hostName}
              size={30}
            />
            <Text numberOfLines={1} style={styles.stageHost}>@{props.stage.hostUsername} · {props.stage.activity}</Text>
            {props.stage.hostIsVerified ? <VerifiedAccountBadge size={16} /> : null}
          </View>

      <View
        style={
          styles.nowPlaying
        }
      >
        {currentTrack?.imageUrl ? (
          <Image
            accessibilityLabel={`${currentTrack.title} album artwork`}
            contentFit="cover"
            source={currentTrack.imageUrl}
            style={styles.albumTile}
            transition={160}
          />
        ) : (
          <View style={styles.albumTile}>
            <Text style={styles.albumTileText}>♪</Text>
          </View>
        )}

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
  const [searchQuery, setSearchQuery] = useState("");
  const [browseFilter, setBrowseFilter] = useState<"all" | "canal" | "verified" | "community">("all");
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
          const [publicLiveStages, hostedStages] = await Promise.all([
            readLiveStages(),
            readHostedLiveStages(),
          ]);
          const loadedStages = Array.from(new Map([
            ...hostedStages.filter((stage) => stage.status === "live"),
            ...publicLiveStages,
          ].map((stage) => [stage.id, stage])).values());
          const nextStages: LiveStage[] = [];
          for (let offset = 0; offset < loadedStages.length; offset += 4) {
            const batch = loadedStages.slice(offset, offset + 4);
            nextStages.push(...await Promise.all(
              batch.map((stage) => addSpotifyArtworkToLiveStage(
                stage,
                [stage.currentTrackIndex],
              )),
            ));
          }

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

  const filteredDiscoverStages = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return discoverStages.filter((stage) => {
      const kindMatches = browseFilter === "all" || getStageKind(stage) === browseFilter;
      if (!kindMatches) return false;
      if (!query) return true;
      return [stage.name, stage.hostName, stage.hostUsername, stage.activity, ...stage.tracks.flatMap((track) => [track.title, track.artist])]
        .some((value) => value.toLocaleLowerCase().includes(query));
    }).sort((a, b) => b.listenerCount - a.listenerCount || new Date(b.startedAt ?? b.createdAt).getTime() - new Date(a.startedAt ?? a.createdAt).getTime());
  }, [browseFilter, discoverStages, searchQuery]);

  const canalStages =
    filteredDiscoverStages.filter(
      (stage) =>
        getStageKind(
          stage,
        ) ===
        "canal",
    );

  const verifiedStages =
    filteredDiscoverStages.filter(
      (stage) =>
        getStageKind(
          stage,
        ) ===
        "verified",
    );

  const communityStages =
    filteredDiscoverStages.filter(
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

        <View style={styles.discoveryTools}>
          <TextInput
            accessibilityLabel="Search public live Stages"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            onChangeText={setSearchQuery}
            placeholder="Search Stages, hosts, songs, or artists"
            placeholderTextColor={canalDynamicColors.muted}
            returnKeyType="search"
            style={styles.searchInput}
            value={searchQuery}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {(["all", "canal", "verified", "community"] as const).map((filter) => (
              <Pressable
                key={filter}
                accessibilityRole="radio"
                accessibilityState={{ checked: browseFilter === filter }}
                onPress={() => setBrowseFilter(filter)}
                style={[styles.filterChip, browseFilter === filter && styles.filterChipSelected]}
              >
                <Text style={[styles.filterText, browseFilter === filter && styles.filterTextSelected]}>
                  {filter === "all" ? "All live" : filter === "canal" ? "Canal" : filter === "verified" ? "Verified" : "Community"}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

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
        ) : liveStages.length === 0 || (filteredDiscoverStages.length === 0 && myStages.length === 0) ? (
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
                {searchQuery.trim() || browseFilter !== "all" ? "No matching Stages." : "The room is quiet."}
              </Text>

              <Text
                selectable
                style={
                  styles.emptyText
                }
              >
                {searchQuery.trim() || browseFilter !== "all"
                  ? "Try another host, song, artist, or Stage category."
                  : "Start the first Stage from one of your saved Scenes, then invite people with its code."}
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
                    Your live rooms
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

    discoveryTools: { gap: 10 },
    searchInput: {
      minHeight: 52,
      paddingHorizontal: 17,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      borderRadius: 18,
      borderCurve: "continuous",
      backgroundColor: canalDynamicColors.surface,
      color: canalDynamicColors.text,
      fontSize: 15,
    },
    filterRow: { gap: 8, paddingRight: 20 },
    filterChip: {
      minHeight: 48,
      justifyContent: "center",
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      borderRadius: 999,
      backgroundColor: canalDynamicColors.surface,
    },
    filterChipSelected: { borderColor: canalDynamicColors.mint, backgroundColor: canalDynamicColors.successSurface },
    filterText: { color: canalDynamicColors.muted, fontSize: 13, fontWeight: "800" },
    filterTextSelected: { color: canalDynamicColors.mint },

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
      color: canalDynamicColors.text,
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
      color: canalDynamicColors.text,
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
      color: canalDynamicColors.text,
      fontSize: 17,
      fontWeight: "900",
    },

    primaryActionText: {
      color: canalDynamicColors.text,
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
      color: canalDynamicColors.text,
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
      color: canalDynamicColors.muted,
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
      color: canalDynamicColors.text,
      fontSize: 22,
      fontWeight: "900",
      textAlign: "center",
    },

    emptyText: {
      maxWidth: 290,
      color: canalDynamicColors.muted,
      fontSize: 15,
      lineHeight: 22,
      textAlign: "center",
    },

    section: {
      gap: 12,
    },

    sectionSubtitle: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 3,
      maxWidth: 280,
    },

    hostedCard: {
      backgroundColor: canalDynamicColors.elevated,
      borderColor: canalDynamicColors.line,
      borderRadius: 24,
      borderCurve: "continuous",
      borderWidth: 1,
      overflow: "hidden",
    },

    hostedCardBody: {
      minHeight: 160,
      padding: 18,
    },

    hostedTopRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },

    hostedStatus: {
      backgroundColor: canalDynamicColors.successSurface,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },

    hostedStatusEnded: {
      backgroundColor: canalDynamicColors.surface,
    },

    hostedStatusText: {
      color: canalDynamicColors.mint,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1,
    },

    hostedStatusTextEnded: {
      color: canalDynamicColors.muted,
    },

    hostedVisibility: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      fontWeight: "800",
    },

    hostedName: {
      color: canalDynamicColors.text,
      fontFamily: "Georgia",
      fontSize: 24,
      fontWeight: "800",
      marginTop: 14,
    },

    hostedMeta: {
      color: canalDynamicColors.text,
      fontSize: 13,
      fontWeight: "700",
      marginTop: 8,
    },

    hostedElapsed: {
      color: canalDynamicColors.mint,
      fontSize: 13,
      fontWeight: "800",
      marginTop: 5,
    },

    hostedManageHint: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      marginTop: 8,
    },

    hostedAction: {
      alignItems: "center",
      borderTopColor: canalDynamicColors.line,
      borderTopWidth: 1,
      justifyContent: "center",
      minHeight: 52,
      paddingHorizontal: 18,
    },

    hostedEndAction: {
      backgroundColor: canalDynamicColors.dangerSurface,
    },

    hostedRestartAction: {
      backgroundColor: canalDynamicColors.successSurface,
    },

    hostedEndText: {
      color: canalDynamicColors.danger,
      fontSize: 14,
      fontWeight: "900",
    },

    hostedRestartText: {
      color: canalDynamicColors.mint,
      fontSize: 14,
      fontWeight: "900",
    },

    disabled: {
      opacity: 0.55,
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
      color: canalDynamicColors.text,
      fontSize: 19,
      fontWeight: "900",
    },

    sectionCount: {
      minWidth: 28,
      color: canalDynamicColors.gold,
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
      color: canalDynamicColors.text,
      fontSize: 24,
      lineHeight: 28,
      fontWeight: "900",
      letterSpacing: -0.4,
    },

    stageHost: {
      flex: 1,
      color: "#AFA198",
      fontSize: 13,
      lineHeight: 18,
    },
    stageHostRow: { flexDirection: "row", alignItems: "center", gap: 5 },

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
      color: canalDynamicColors.text,
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
      color: canalDynamicColors.text,
      fontSize: 15,
      fontWeight: "900",
    },

    trackArtist: {
      color: "#9E9188",
      fontSize: 12,
    },

    cardArrow: {
      color: canalDynamicColors.muted,
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
