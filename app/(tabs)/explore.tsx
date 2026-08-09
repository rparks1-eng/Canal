import { canalDynamicColors } from "../../theme/canal-dynamic-colors";

import {
  useCallback,
  useMemo,
  useState,
} from "react";

import { Image } from "expo-image";

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
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";

import {
  SafeAreaView,
} from "react-native-safe-area-context";
import { CanalAmbientBackground } from "../../components/canal-ui/canal-ambient-background";

import Animated, {
  FadeInUp,
} from "react-native-reanimated";

import {
  PublicSnapshotCard,
} from "../../components/PublicSnapshotCard";
import {
  scenePresentation,
} from "../../components/canal-ui/scene-signature";

import {
  RecoveryNotice,
} from "../../components/recovery-notice";

import {
  useReconnectReload,
} from "../../hooks/use-reconnect-reload";

import {
  classifyRecoveryIssue,
} from "../../lib/recovery-issue";

import type {
  RecoveryIssue,
} from "../../lib/recovery-issue";

import {
  loadPublicSnapshotFeed,
} from "../../lib/public-snapshots";

import type {
  PublicCanalSnapshot,
} from "../../lib/public-snapshots";

import {
  loadExploreScenes,
  savePublicSceneToLibrary,
} from "../../lib/social";

import type {
  PublicCanalScene,
} from "../../lib/social";

import {
  useConnectivity,
} from "../../providers/connectivity-provider";

import { useAuth } from "../../providers/auth-provider";

import {
  loadSnapshotSocialSummaries,
  setSnapshotLike,
} from "../../lib/snapshot-social";

import type { SnapshotSocialSummary } from "../../lib/snapshot-social";

import {
  getCurrentLiveStageTrack,
  readLiveStages,
} from "../../lib/live-stages";

import type {
  LiveStage,
  LiveStageKind,
} from "../../lib/live-stages";

type ExploreContent =
  | "snapshots"
  | "scenes"
  | "stages";

type StageFilter = "all" | LiveStageKind;

function filterExploreStages(
  stages: readonly LiveStage[],
  query: string,
  filter: StageFilter,
): LiveStage[] {
  const needle = query.trim().toLowerCase();
  return stages.filter((stage) => {
    if (stage.visibility !== "public" || stage.status !== "live") return false;
    if (filter !== "all" && stage.stageKind !== filter) return false;
    if (!needle) return true;
    return [stage.name, stage.hostName, stage.hostUsername, stage.activity, ...(stage.atmosphereSignals ?? [])]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

function PublicStageCard({ stage }: { stage: LiveStage }) {
  const track = getCurrentLiveStageTrack(stage);
  const provenance = stage.stageKind === "canal"
    ? "CANAL"
    : stage.stageKind === "verified"
      ? "VERIFIED"
      : "COMMUNITY";

  return (
    <Pressable
      accessibilityLabel={`Play ${stage.name}, live Stage hosted by ${stage.hostName}`}
      accessibilityRole="button"
      onPress={() => router.push({
        pathname: "/live-stage/[stageId]",
        params: { stageId: stage.id },
      })}
      style={({ pressed }) => [styles.stageResult, pressed && styles.pressed]}
    >
      <View style={styles.stageResultTop}>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveBadgeText}>LIVE</Text>
        </View>
        <Text style={styles.stageProvenance}>{provenance}</Text>
        <Text style={styles.stageAudience}>{stage.participantCount} in room</Text>
      </View>
      <Text numberOfLines={2} style={styles.stageResultName}>{stage.name}</Text>
      <Text numberOfLines={1} style={styles.stageResultMeta}>
        @{stage.hostUsername} · {stage.activity || "Live music"} · {stage.tracks.length} tracks
      </Text>
      <View style={styles.stageNowPlaying}>
        {track?.imageUrl ? (
          <Image
            accessibilityLabel={`${track.title} album artwork`}
            contentFit="cover"
            source={track.imageUrl}
            style={styles.stageArtwork}
            transition={160}
          />
        ) : (
          <View style={styles.stageArtworkFallback} />
        )}
        <View style={styles.stageTrackCopy}>
          <Text style={styles.stageTrackKicker}>NOW PLAYING</Text>
          <Text numberOfLines={1} style={styles.stageTrackTitle}>
            {track?.title ?? "The Stage queue is ready"}
          </Text>
          <Text numberOfLines={1} style={styles.stageTrackArtist}>
            {track?.artist ?? "Open to listen"}
          </Text>
        </View>
        <Text style={styles.stagePlay}>›</Text>
      </View>
    </Pressable>
  );
}

function PublicSceneCard(
  props: {
    item: PublicCanalScene;
    saving: boolean;
    onSave: () => void;
  },
) {
  const {
    item,
  } = props;
  const presentation = scenePresentation(item.scene);

  const artistPreview =
    item.scene.tracks
      .slice(
        0,
        3,
      )
      .map(
        (track) =>
          track.artist,
      )
      .filter(
        Boolean,
      )
      .join(
        ", ",
      );

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: presentation.colors[2],
          borderColor: `${presentation.accent}40`,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.push({
            pathname:
              "/public-scene",

            params: {
              ownerId:
                item.ownerId,

              sceneId:
                item.sceneId,
            },
          } as never)
        }
        style={({
          pressed,
        }) => [
          styles.scenePressable,

          pressed &&
            styles.pressed,
        ]}
      >
        <View
          style={
            styles.cardTop
          }
        >
          <View
            style={
              styles.cardText
            }
          >
            <Text
              numberOfLines={
                1
              }
              style={
                styles.sceneName
              }
            >
              {item.scene.name}
            </Text>

            <Text
              numberOfLines={
                1
              }
              style={
                styles.sceneMeta
              }
            >
              {item.scene.activity ||
                "Any activity"}{" "}
              ·{" "}
              {item.scene.tracks.length}{" "}
              tracks
            </Text>

            <Text
              numberOfLines={
                1
              }
              style={
                styles.artistText
              }
            >
              {artistPreview ||
                item.scene.emotions ||
                "Canal Scene"}
            </Text>
          </View>
        </View>
      </Pressable>

      <View
        style={
          styles.creatorRow
        }
      >
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname:
                "/creator/[userId]",

              params: {
                userId:
                  item.ownerId,
              },
            } as never)
          }
          style={({
            pressed,
          }) => [
            styles.creatorButton,

            pressed &&
              styles.pressed,
          ]}
        >
          <View
            style={
              styles.creatorAvatar
            }
          >
            <Text
              style={
                styles.creatorAvatarText
              }
            >
              {item.creator.displayName
                .charAt(
                  0,
                )
                .toUpperCase()}
            </Text>
          </View>

          <View
            style={
              styles.creatorText
            }
          >
            <Text
              numberOfLines={
                1
              }
              style={
                styles.creatorName
              }
            >
              {item.creator.displayName}
              {item.isMine
                ? " · You"
                : ""}
            </Text>

            <Text
              style={
                styles.creatorHandle
              }
            >
              {item.creator.handle}
            </Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={
            item.isMine ||
            item.savedByMe ||
            props.saving
          }
          onPress={
            props.onSave
          }
          style={[
            styles.saveButton,

            (
              item.isMine ||
              item.savedByMe ||
              props.saving
            ) &&
              styles.saveButtonDisabled,
          ]}
        >
          {props.saving ? (
            <ActivityIndicator
              color="#FFFFFF"
              size="small"
            />
          ) : (
            <Text
              style={
                styles.saveButtonText
              }
            >
              {item.isMine
                ? "Yours"
                : item.savedByMe
                  ? "Saved"
                  : "Save"}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export default function ExploreScreen() {
  const params = useLocalSearchParams<{ content?: string }>();
  const { user } = useAuth();
  const {
    refresh:
      refreshConnectivity,
    status:
      connectivityStatus,
  } =
    useConnectivity();

  const [
    scenes,
    setScenes,
  ] =
    useState<
      PublicCanalScene[]
    >([]);

  const [
    snapshots,
    setSnapshots,
  ] =
    useState<
      PublicCanalSnapshot[]
    >([]);

  const [snapshotSocial, setSnapshotSocial] =
    useState<Record<string, SnapshotSocialSummary>>({});

  const [stages, setStages] = useState<LiveStage[]>([]);
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");

  const [socialActionKey, setSocialActionKey] = useState("");

  const [
    activeContent,
    setActiveContent,
  ] =
    useState<ExploreContent>(
      params.content === "stages" ? "stages" : "snapshots",
    );

  const [
    query,
    setQuery,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    savingKey,
    setSavingKey,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    loadErrors,
    setLoadErrors,
  ] = useState<{
    snapshots:
      RecoveryIssue | null;
    scenes:
      RecoveryIssue | null;
    stages:
      RecoveryIssue | null;
  }>({
    snapshots: null,
    scenes: null,
    stages: null,
  });

  const load =
    useCallback(
      async (mode: "initial" | "refresh" = "initial"): Promise<void> => {
        const isPullRefresh = mode === "refresh";

        setRefreshing(isPullRefresh);

        if (!isPullRefresh) {
          setLoading(true);
        }

        setLoadErrors({
          snapshots: null,
          scenes: null,
          stages: null,
        });

        const [
          snapshotResult,
          sceneResult,
          stageResult,
        ] =
          await Promise.allSettled([
            loadPublicSnapshotFeed(),
            loadExploreScenes(),
            readLiveStages(),
          ]);

        if (
          snapshotResult.status ===
          "fulfilled"
        ) {
          setSnapshots(
            snapshotResult.value,
          );

          if (user?.id) {
            try {
              setSnapshotSocial(
                await loadSnapshotSocialSummaries(
                  snapshotResult.value.map(
                    (snapshot) => snapshot.id,
                  ),
                  user.id,
                ),
              );
            } catch (error) {
              console.warn(
                "Snapshot social counts are temporarily unavailable:",
                error,
              );
            }
          }
        } else {
          setLoadErrors(
            (current) => ({
              ...current,

              snapshots:
                classifyRecoveryIssue(
                  snapshotResult.reason,
                  {
                    service:
                      "canal",
                    connectivityStatus,
                  },
                ),
            }),
          );
        }

        if (
          sceneResult.status ===
          "fulfilled"
        ) {
          setScenes(
            sceneResult.value,
          );
        } else {
          setLoadErrors(
            (current) => ({
              ...current,

              scenes:
                classifyRecoveryIssue(
                  sceneResult.reason,
                  {
                    service:
                      "canal",
                    connectivityStatus,
                  },
                ),
            }),
          );
        }

        if (stageResult.status === "fulfilled") {
          setStages(stageResult.value.filter((stage) =>
            stage.status === "live" && stage.visibility === "public",
          ));
        } else {
          setLoadErrors((current) => ({
            ...current,
            stages: classifyRecoveryIssue(stageResult.reason, {
              service: "canal",
              connectivityStatus,
            }),
          }));
        }

        setLoading(
          false,
        );

        setRefreshing(
          false,
        );
      },
      [
        connectivityStatus,
        user?.id,
      ],
    );

  const toggleSnapshotLike = async (
    snapshot: PublicCanalSnapshot,
  ): Promise<void> => {
    if (!user?.id || socialActionKey) return;

    const current = snapshotSocial[snapshot.id] ?? {
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
    };
    const nextLiked = !current.likedByMe;

    setSocialActionKey(`like:${snapshot.id}`);
    setSnapshotSocial((state) => ({
      ...state,
      [snapshot.id]: {
        ...current,
        likedByMe: nextLiked,
        likeCount: Math.max(
          0,
          current.likeCount + (nextLiked ? 1 : -1),
        ),
      },
    }));

    try {
      await setSnapshotLike(
        snapshot.id,
        nextLiked,
        user.id,
      );
    } catch (error) {
      setSnapshotSocial((state) => ({
        ...state,
        [snapshot.id]: current,
      }));
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Canal could not update this Snapshot reaction.",
      );
    } finally {
      setSocialActionKey("");
    }
  };

  useFocusEffect(
    useCallback(
      () => {
        void load();
      },
      [
        load,
      ],
    ),
  );

  useReconnectReload(
    load,
  );

  const filteredScenes =
    useMemo(
      () => {
        const needle =
          query
            .trim()
            .toLowerCase();

        if (!needle) {
          return scenes;
        }

        return scenes.filter(
          (item) =>
            [
              item.scene.name,
              item.scene.activity,
              item.scene.emotions,
              item.scene.genres,
              item.creator.displayName,
              item.creator.handle,
              ...item.scene.tracks.map(
                (track) =>
                  `${track.title} ${track.artist}`,
              ),
            ]
              .join(
                " ",
              )
              .toLowerCase()
              .includes(
                needle,
              ),
        );
      },
      [
        query,
        scenes,
      ],
    );

  const filteredSnapshots =
    useMemo(
      () => {
        const needle =
          query
            .trim()
            .toLowerCase();

        if (!needle) {
          return snapshots;
        }

        return snapshots.filter(
          (snapshot) =>
            [
              snapshot.sceneName,
              snapshot.trackTitle,
              snapshot.trackArtist,
              snapshot.note,
              snapshot.mood,
              snapshot.creator
                .displayName,
              snapshot.creator
                .handle,
            ]
              .filter(
                Boolean,
              )
              .join(
                " ",
              )
              .toLowerCase()
              .includes(
                needle,
              ),
        );
      },
      [
        query,
        snapshots,
      ],
    );

  const filteredStages = useMemo(() => {
    return filterExploreStages(stages, query, stageFilter);
  }, [query, stageFilter, stages]);

  const activeError =
    loadErrors[
      activeContent
    ];

  const recoverLoad =
    async (): Promise<void> => {
      if (
        activeError?.action ===
        "sign-in"
      ) {
        router.replace(
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
        await load();
      }
    };

  const save =
    async (
      item: PublicCanalScene,
    ): Promise<void> => {
      const key =
        `${item.ownerId}:${item.sceneId}`;

      setSavingKey(
        key,
      );

      setMessage("");
      setErrorMessage("");

      try {
        await savePublicSceneToLibrary(
          item,
        );

        setScenes(
          (current) =>
            current.map(
              (candidate) =>
                candidate.ownerId ===
                  item.ownerId &&
                candidate.sceneId ===
                  item.sceneId
                  ? {
                      ...candidate,

                      savedByMe:
                        true,
                    }
                  : candidate,
            ),
        );

        setMessage(
          `"${item.scene.name}" was saved to your Library.`,
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not save this Scene.",
        );
      } finally {
        setSavingKey(
          "",
        );
      }
    };

  return (
    <SafeAreaView
      style={
        styles.safeArea
      }
      edges={[
        "top",
      ]}
    >
      <CanalAmbientBackground />
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        refreshControl={
          <RefreshControl
            onRefresh={() => {
              void load("refresh");
            }}
            refreshing={refreshing}
            tintColor={canalDynamicColors.mint}
          />
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={
          false
        }
      >
        <Animated.View
          entering={FadeInUp.duration(260)}
          style={
            styles.header
          }
        >
          <View>
            <Text style={styles.eyebrow}>CANAL DISCOVERY</Text>
            <Text
              style={
                styles.title
              }
            >
              Explore
            </Text>

            <Text
              style={
                styles.subtitle
              }
            >
              Live Stages, public Scenes, and visual moments moving through Canal.
            </Text>
          </View>

        </Animated.View>

        <Animated.View
          entering={FadeInUp.duration(260).delay(45)}
          style={styles.liveFeature}
        >
          <Text style={styles.featureKicker}>LIVE ON CANAL</Text>
          <Text style={styles.featureTitle}>Step into the room.</Text>
          <Text style={styles.featureText}>
            Browse public Stages shaped by artists, creators, and listeners right now.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Browse Live Stages"
            onPress={() => setActiveContent("stages")}
            style={({ pressed }) => [styles.featureButton, pressed && styles.pressed]}
          >
            <Text style={styles.featureButtonText}>Browse Live Stages</Text>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(260).delay(80)}>
        <TextInput
          value={
            query
          }
          onChangeText={
            setQuery
          }
          placeholder={activeContent === "stages"
            ? "Search Stages, hosts, activities, songs, or artists"
            : "Search moments, Scenes, creators, moods, or artists"}
          placeholderTextColor="#9A938C"
          autoCapitalize="none"
          autoCorrect={
            false
          }
          style={
            styles.searchInput
          }
        />
        </Animated.View>

        <Animated.View
          entering={FadeInUp.duration(260).delay(110)}
          accessibilityRole="tablist"
          style={
            styles.segmentedControl
          }
        >
          <ExploreTab
            active={
              activeContent ===
              "snapshots"
            }
            count={
              snapshots.length
            }
            label="Snapshots"
            onPress={() =>
              setActiveContent(
                "snapshots",
              )
            }
          />

          <ExploreTab
            active={
              activeContent ===
              "scenes"
            }
            count={
              scenes.length
            }
            label="Scenes"
            onPress={() =>
              setActiveContent(
                "scenes",
              )
            }
          />

          <ExploreTab
            active={activeContent === "stages"}
            count={stages.length}
            label="Stages"
            onPress={() => setActiveContent("stages")}
          />
        </Animated.View>

        {activeContent === "stages" ? (
          <Animated.View
            entering={FadeInUp.duration(220)}
            style={styles.stageFilters}
          >
            {(["all", "canal", "verified", "community"] as StageFilter[]).map((value) => (
              <Pressable
                key={value}
                accessibilityLabel={`Filter public Stages by ${value}`}
                accessibilityRole="button"
                accessibilityState={{ selected: stageFilter === value }}
                onPress={() => setStageFilter(value)}
                style={[
                  styles.stageFilterButton,
                  stageFilter === value && styles.stageFilterSelected,
                ]}
              >
                <Text style={[
                  styles.stageFilterText,
                  stageFilter === value && styles.stageFilterTextSelected,
                ]}>
                  {value === "all" ? "All" : value.charAt(0).toUpperCase() + value.slice(1)}
                </Text>
              </Pressable>
            ))}
          </Animated.View>
        ) : null}

        {message ? (
          <View
            style={
              styles.successBox
            }
          >
            <Text
              style={
                styles.successText
              }
            >
              {message}
            </Text>
          </View>
        ) : null}

        {errorMessage ? (
          <View
            accessibilityRole="alert"
            style={
              styles.errorBox
            }
          >
            <Text
              style={
                styles.errorText
              }
            >
              {errorMessage}
            </Text>
          </View>
        ) : null}

        {activeError ? (
          <RecoveryNotice
            busy={
              loading
            }
            issue={
              activeError
            }
            onAction={
              recoverLoad
            }
          />
        ) : null}

        {loading ? (
          <View
            style={
              styles.loadingCard
            }
          >
            <ActivityIndicator
              size="large"
            />

            <Text
              style={
                styles.loadingText
              }
            >
              Loading public {activeContent}...
            </Text>
          </View>
        ) : activeError &&
          (
            activeContent ===
              "snapshots"
              ? filteredSnapshots.length ===
                0
              : activeContent === "scenes"
                ? filteredScenes.length === 0
                : filteredStages.length === 0
          ) ? null : activeContent ===
          "snapshots" &&
          filteredSnapshots.length ===
          0 ? (
          <View
            style={
              styles.emptyCard
            }
          >
            <Text
              style={
                styles.emptyTitle
              }
            >
              {query.trim()
                ? "No matching Snapshots"
                : "No public Snapshots yet"}
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              {query.trim()
                ? "Try a different Scene, creator, mood, track, or note."
                : "Publish a Snapshot from one of your Scenes. Your public moment will appear here for other listeners to discover."}
            </Text>
          </View>
        ) : activeContent === "stages" && filteredStages.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {query.trim() || stageFilter !== "all"
                ? "No matching live Stages"
                : "No public Stages are live"}
            </Text>
            <Text style={styles.emptyText}>
              {query.trim() || stageFilter !== "all"
                ? "Try another host, activity, song, artist, or Stage type."
                : "Pull down to refresh. Public Stages will appear here as soon as they go live."}
            </Text>
          </View>
        ) : activeContent === "stages" ? (
          <View style={styles.list}>
            {filteredStages.map((stage, index) => (
              <Animated.View
                entering={FadeInUp.duration(240).delay(Math.min(index, 5) * 35)}
                key={stage.id}
              >
                <PublicStageCard stage={stage} />
              </Animated.View>
            ))}
          </View>
        ) : activeContent ===
          "snapshots" ? (
          <View
            style={
              styles.list
            }
          >
            {filteredSnapshots.map(
              (snapshot, index) => (
                <Animated.View
                  key={
                    snapshot.id
                  }
                  entering={FadeInUp.duration(240).delay(Math.min(index, 5) * 35)}
                  style={index === 0 ? styles.editorialFeature : undefined}
                >
                <PublicSnapshotCard
                  showCreator
                  snapshot={
                    snapshot
                  }
                  socialSummary={
                    snapshotSocial[
                      snapshot.id
                    ]
                  }
                  likeBusy={
                    socialActionKey ===
                    `like:${snapshot.id}`
                  }
                  onToggleLike={() =>
                    void toggleSnapshotLike(
                      snapshot,
                    )
                  }
                  onOpenComments={() =>
                    router.push({
                      pathname:
                        "/snapshots/[snapshotId]",
                      params: {
                        snapshotId:
                          snapshot.id,
                        comments:
                          "1",
                      },
                    } as never)
                  }
                />
                </Animated.View>
              ),
            )}
          </View>
        ) : filteredScenes.length ===
          0 ? (
          <View
            style={
              styles.emptyCard
            }
          >
            <Text
              style={
                styles.emptyTitle
              }
            >
              {query.trim()
                ? "No matching Scenes"
                : "No public Scenes yet"}
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              {query.trim()
                ? "Try a different Scene, creator, mood, or artist."
                : "Change one of your created Scenes to Public in Library. Your own public Scene will appear here so the social flow can be tested before other creators join."}
            </Text>
          </View>
        ) : (
          <View
            style={
              styles.list
            }
          >
            {filteredScenes.map(
              (item) => {
                const key =
                  `${item.ownerId}:${item.sceneId}`;

                return (
                  <PublicSceneCard
                    key={
                      key
                    }
                    item={
                      item
                    }
                    saving={
                      savingKey ===
                      key
                    }
                    onSave={() =>
                      void save(
                        item,
                      )
                    }
                  />
                );
              },
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor:
        "transparent",
    },

    liveFeature: {
      minHeight: 168,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: "rgba(255, 225, 220, 0.27)",
      borderRadius: 27,
      borderCurve: "continuous",
      backgroundColor: "rgba(79, 47, 102, 0.62)",
      padding: 18,
      justifyContent: "flex-end",
      boxShadow: "0 18px 42px rgba(35, 15, 55, 0.22)",
    },

    liveFeatureGlow: {
      position: "absolute",
      left: -30,
      right: -30,
      height: 76,
      top: 10,
      transform: [{ rotate: "-6deg" }],
      backgroundColor: "rgba(255, 188, 177, 0.18)",
    },

    featureKicker: {
      color: "#D7FFF6",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1.7,
    },

    featureTitle: {
      color: canalDynamicColors.text,
      fontFamily: "Georgia",
      fontSize: 29,
      fontWeight: "500",
      letterSpacing: -0.6,
      marginTop: 7,
    },

    featureText: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      lineHeight: 18,
      maxWidth: 290,
      marginTop: 6,
    },

    featureButton: {
      minHeight: 48,
      alignSelf: "flex-start",
      justifyContent: "center",
      borderRadius: 15,
      backgroundColor: "rgba(244, 255, 252, 0.92)",
      paddingHorizontal: 16,
      marginTop: 15,
    },

    featureButtonText: {
      color: "#3D3457",
      fontSize: 11,
      fontWeight: "900",
    },

    content: {
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 120,
      gap: 11,
    },

    header: {
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      marginBottom: 2,
    },

    eyebrow: {
      color: "rgba(222, 255, 249, 0.82)",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 2.1,
      marginBottom: 8,
    },

    title: {
      color: "#F7FFFD",
      fontSize: 38,
      fontWeight: "500",
      letterSpacing: -1.1,
    },

    subtitle: {
      color: "rgba(239,255,250,0.72)",
      fontSize: 13,
      marginTop: 3,
      lineHeight: 19,
    },

    refreshButton: {
      borderWidth: 1,
      borderColor:
        "#E2DAD4",
      borderRadius: 14,
      backgroundColor:
        "#FFFFFF",
      paddingHorizontal: 13,
      paddingVertical: 10,
    },

    refreshText: {
      color: "#F47A24",
      fontSize: 11,
      fontWeight: "900",
    },

    searchInput: {
      minHeight: 49,
      borderWidth: 1,
      borderColor:
        canalDynamicColors.line,
      borderRadius: 18,
      backgroundColor:
        "#FFFFFF",
      color: "#1B1B1B",
      fontSize: 15,
      fontWeight: "500",
      letterSpacing: -0.2,
      lineHeight: 20,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginBottom: 0,
    },

    segmentedControl: {
      flexDirection: "row",
      borderRadius: 16,
      backgroundColor:
        "rgba(5, 37, 58, 0.42)",
      padding: 4,
      marginBottom: 0,
      gap: 4,
    },

    segmentButton: {
      minHeight: 42,
      flex: 1,
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 13,
      gap: 4,
    },

    segmentButtonActive: {
      backgroundColor:
        "#FFFFFF",
    },

    segmentText: {
      color: "#817972",
      fontSize: 12,
      fontWeight: "800",
    },

    segmentTextActive: {
      color: "#1B1B1B",
    },

    segmentCount: {
      minWidth: 19,
      borderRadius: 99,
      backgroundColor:
        "rgba(219, 255, 248, 0.16)",
      color: "#625B55",
      fontSize: 9,
      fontWeight: "900",
      textAlign: "center",
      paddingHorizontal: 6,
      paddingVertical: 3,
      overflow: "hidden",
    },

    segmentCountActive: {
      backgroundColor:
        "#FFF0E5",
      color: "#123F54",
    },

    list: {
      gap: 14,
    },

    editorialFeature: {
      overflow: "hidden",
      borderRadius: 27,
      borderCurve: "continuous",
      boxShadow: "0 18px 42px rgba(32, 15, 52, 0.2)",
    },

    stageFilters: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
    },

    stageFilterButton: {
      minHeight: 44,
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(255, 226, 220, 0.22)",
      borderRadius: 18,
      backgroundColor: "rgba(45, 29, 65, 0.4)",
      paddingHorizontal: 13,
    },

    stageFilterSelected: {
      backgroundColor: "rgba(244, 255, 252, 0.92)",
    },

    stageFilterText: {
      color: canalDynamicColors.muted,
      fontSize: 10,
      fontWeight: "800",
    },

    stageFilterTextSelected: {
      color: "#3D3457",
    },

    stageResult: {
      position: "relative",
      overflow: "hidden",
      minHeight: 260,
      borderWidth: 1,
      borderColor: "rgba(255, 226, 220, 0.25)",
      borderRadius: 27,
      borderCurve: "continuous",
      backgroundColor: "rgba(71, 46, 100, 0.62)",
      padding: 18,
      boxShadow: "0 18px 42px rgba(35, 15, 55, 0.2)",
    },

    stageResultGlow: {
      position: "absolute",
      width: 210,
      height: 210,
      borderRadius: 105,
      top: -80,
      right: -58,
      backgroundColor: "rgba(255, 184, 169, 0.28)",
    },

    stageResultTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },

    liveBadge: {
      minHeight: 28,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 14,
      backgroundColor: "rgba(102, 22, 47, 0.64)",
      paddingHorizontal: 9,
    },

    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: "#FF8A83",
    },

    liveBadgeText: {
      color: "#FFE8E5",
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 1.2,
    },

    stageProvenance: {
      color: "#D4FFF5",
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 1.1,
    },

    stageAudience: {
      flex: 1,
      color: canalDynamicColors.muted,
      fontSize: 9,
      textAlign: "right",
    },

    stageResultName: {
      color: canalDynamicColors.text,
      fontFamily: "Georgia",
      fontSize: 29,
      fontWeight: "500",
      letterSpacing: -0.6,
      marginTop: 18,
    },

    stageResultMeta: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      marginTop: 5,
    },

    stageNowPlaying: {
      minHeight: 78,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      borderWidth: 1,
      borderColor: "rgba(228, 255, 250, 0.16)",
      borderRadius: 18,
      backgroundColor: "rgba(10, 34, 59, 0.42)",
      padding: 10,
      marginTop: 18,
    },

    stageArtwork: {
      width: 55,
      height: 55,
      borderRadius: 13,
    },

    stageArtworkFallback: {
      width: 55,
      height: 55,
      borderRadius: 13,
      backgroundColor: "rgba(202, 255, 244, 0.18)",
    },

    stageTrackCopy: {
      flex: 1,
      minWidth: 0,
    },

    stageTrackKicker: {
      color: "#C8FFF3",
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 1.3,
    },

    stageTrackTitle: {
      color: canalDynamicColors.text,
      fontSize: 13,
      fontWeight: "800",
      marginTop: 4,
    },

    stageTrackArtist: {
      color: canalDynamicColors.muted,
      fontSize: 10,
      marginTop: 2,
    },

    stagePlay: {
      color: "#E8FFF9",
      fontSize: 29,
      paddingHorizontal: 5,
    },

    card: {
      backgroundColor:
        "#FFFFFF",
      borderRadius: 22,
      padding: 15,
    },

    scenePressable: {
      borderRadius: 17,
    },

    cardTop: {
      flexDirection: "row",
      alignItems:
        "center",
    },

    artwork: {
      width: 64,
      height: 64,
      borderRadius: 18,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#FFF0E5",
      marginRight: 13,
    },

    artworkText: {
      color: "#F47A24",
      fontSize: 25,
      fontWeight: "900",
    },

    cardText: {
      flex: 1,
    },

    sceneName: {
      color: "#1B1B1B",
      fontSize: 17,
      fontWeight: "900",
    },

    sceneMeta: {
      color: "#746D67",
      fontSize: 11,
      marginTop: 4,
    },

    artistText: {
      color: "#9A938C",
      fontSize: 10,
      marginTop: 4,
    },

    creatorRow: {
      flexDirection: "row",
      alignItems:
        "center",
      borderTopWidth: 1,
      borderTopColor:
        canalDynamicColors.line,
      marginTop: 14,
      paddingTop: 12,
    },

    creatorButton: {
      flex: 1,
      flexDirection: "row",
      alignItems:
        "center",
    },

    creatorAvatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        canalDynamicColors.elevated,
      marginRight: 9,
    },

    creatorAvatarText: {
      color: canalDynamicColors.text,
      fontSize: 12,
      fontWeight: "900",
    },

    creatorText: {
      flex: 1,
    },

    creatorName: {
      color: "#322E2B",
      fontSize: 12,
      fontWeight: "900",
    },

    creatorHandle: {
      color: "#8B837C",
      fontSize: 10,
      marginTop: 2,
    },

    saveButton: {
      minWidth: 68,
      minHeight: 38,
      borderRadius: 13,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F47A24",
      paddingHorizontal: 12,
      marginLeft: 10,
    },

    saveButtonDisabled: {
      backgroundColor:
        canalDynamicColors.elevated,
    },

    saveButtonText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "900",
    },

    loadingCard: {
      minHeight: 180,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#FFFFFF",
      borderRadius: 22,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
    },

    loadingText: {
      color: "#746D67",
      fontSize: 13,
      marginTop: 12,
    },

    emptyCard: {
      backgroundColor:
        "#FFFFFF",
      borderRadius: 22,
      padding: 22,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
    },

    emptyTitle: {
      color: "#1B1B1B",
      fontSize: 18,
      fontWeight: "900",
    },

    emptyText: {
      color: "#746D67",
      fontSize: 13,
      lineHeight: 20,
      marginTop: 7,
    },

    successBox: {
      backgroundColor:
        "#EAF9EF",
      borderRadius: 15,
      padding: 13,
      marginBottom: 13,
    },

    successText: {
      color: "#1D7138",
      fontSize: 12,
      lineHeight: 18,
    },

    errorBox: {
      backgroundColor:
        "#FFF0EF",
      borderRadius: 15,
      padding: 13,
      marginBottom: 13,
    },

    errorText: {
      color: "#A62E27",
      fontSize: 12,
      lineHeight: 18,
    },

    errorTitle: {
      color: "#8D211C",
      fontSize: 13,
      fontWeight: "900",
      marginBottom: 4,
    },

    recoveryButton: {
      alignSelf:
        "flex-start",
      borderRadius: 12,
      backgroundColor:
        "#A62E27",
      paddingHorizontal: 12,
      paddingVertical: 9,
      marginTop: 10,
    },

    recoveryButtonText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "900",
    },

    pressed: {
      opacity: 0.7,
    },
  });

function ExploreTab(
  props: {
    active: boolean;
    count: number;
    label: string;
    onPress: () => void;
  },
) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{
        selected:
          props.active,
      }}
      onPress={
        props.onPress
      }
      style={[
        styles.segmentButton,

        props.active &&
          styles.segmentButtonActive,
      ]}
    >
      <Text
        style={[
          styles.segmentText,

          props.active &&
            styles.segmentTextActive,
        ]}
      >
        {props.label}
      </Text>

      <Text
        style={[
          styles.segmentCount,

          props.active &&
            styles.segmentCountActive,
        ]}
      >
        {props.count}
      </Text>
    </Pressable>
  );
}
