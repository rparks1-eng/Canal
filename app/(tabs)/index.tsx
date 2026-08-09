import {
  useCallback,
  useState,
} from "react";

import {
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

import { canalDynamicColors } from "../../theme/canal-dynamic-colors";

import {
  StatusBar,
} from "expo-status-bar";

import {
  CanalHeaderActions,
} from "../../components/canal-ui/canal-header-actions";

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
  getLatestSpotifyLibrarySnapshot,
  syncSpotifyLibrary,
} from "../../lib/spotify-library";

import type {
  SpotifyLibrarySnapshot,
} from "../../lib/spotify-library";

import {
  rankSceneRecommendations,
} from "../../lib/scene-recommendations";

import {
  getRecentScenes,
  readScenes,
  sceneDurationMinutes,
} from "../../lib/scenes";

import type {
  StoredScene,
} from "../../lib/scenes";

import {
  readListeningHistory,
} from "../../lib/canal-session";

import type {
  ListeningHistoryEntry,
} from "../../lib/canal-session";

import {
  useConnectivity,
} from "../../providers/connectivity-provider";

function SceneCard(props: {
  scene: StoredScene;
  compact?: boolean;
}) {
  const presentation =
    scenePresentation(props.scene);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({
          pathname:
            "/scenes/[sceneId]",

          params: {
            sceneId:
              props.scene.id,
          },
        })
      }
      style={({ pressed }) => [
        props.compact
          ? styles.compactSceneCard
          : styles.sceneCard,

        {
          backgroundColor:
            presentation.colors[2],
          borderColor:
            `${presentation.accent}40`,
        },

        pressed &&
          styles.pressed,
      ]}
    >
      <Text
        style={[styles.sceneActivity, { color: presentation.accent }]}
      >
        {props.scene.activity}
      </Text>

      <Text
        numberOfLines={2}
        style={[styles.sceneName, { color: "#FFFFFF" }]}
      >
        {props.scene.name}
      </Text>

      <Text
        numberOfLines={2}
        style={[styles.sceneMood, { color: "rgba(255,255,255,0.7)" }]}
      >
        {props.scene.emotions ||
          `${props.scene.energy} energy`}
      </Text>

      <Text
        style={[styles.sceneMeta, { color: `${presentation.accent}C7` }]}
      >
        {
          props.scene.tracks
            .length
        }{" "}
        tracks •{" "}
        {sceneDurationMinutes(
          props.scene,
        )}{" "}
        min
      </Text>

      {props.scene.favorite ? (
        <Text
          style={
            styles.favoriteMark
          }
        >
          ★
        </Text>
      ) : null}
    </Pressable>
  );
}

function EmptyScenes() {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyTitle}>
        Your first Scene starts here
      </Text>

      <Text style={styles.emptyText}>
        Connect Spotify, import your taste,
        and create a soundtrack for the
        moment you are in.
      </Text>

      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.push(
            "/scene-studio",
          )
        }
        style={({ pressed }) => [
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
          Set the Scene
        </Text>
      </Pressable>
    </View>
  );
}

export default function HomeScreen() {
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
  ] = useState<StoredScene[]>([]);

  const [
    recentScenes,
    setRecentScenes,
  ] = useState<StoredScene[]>([]);

  const [
    history,
    setHistory,
  ] = useState<
    ListeningHistoryEntry[]
    >([]);

  const [
    spotifySnapshot,
    setSpotifySnapshot,
  ] =
    useState<SpotifyLibrarySnapshot | null>(
      null,
    );

  const [
    recommendationWarning,
    setRecommendationWarning,
  ] =
    useState<string | null>(
      null,
    );

  const [
    recommendationIssue,
    setRecommendationIssue,
  ] =
    useState<RecoveryIssue | null>(
      null,
    );

  const [
    refreshingRecommendations,
    setRefreshingRecommendations,
  ] = useState(false);

  const load =
    useCallback(() => {
      const run =
        async (): Promise<void> => {
          const [
            storedScenes,
            storedRecent,
            storedHistory,
            latestSpotify,
          ] =
            await Promise.all([
              readScenes(),
              getRecentScenes(5),
              readListeningHistory(),
              getLatestSpotifyLibrarySnapshot(),
            ]);

          setScenes(
            storedScenes,
          );

          setRecentScenes(
            storedRecent,
          );

          setHistory(
            storedHistory,
          );

          setSpotifySnapshot(
            latestSpotify.snapshot,
          );

          setRecommendationWarning(
            latestSpotify.warning ??
              null,
          );

          setRecommendationIssue(
            latestSpotify.issue ??
              null,
          );
        };

      void run();
    }, []);

  useFocusEffect(load);

  const refreshRecommendations =
    useCallback(
      async (): Promise<void> => {
        setRefreshingRecommendations(
          true,
        );

        try {
          const snapshot =
            await syncSpotifyLibrary();

          setSpotifySnapshot(
            snapshot,
          );

          setRecommendationWarning(
            null,
          );

          setRecommendationIssue(
            null,
          );
        } catch (error) {
          setRecommendationIssue(
            classifyRecoveryIssue(
              error,
              {
                service:
                  "spotify",
                connectivityStatus,
              },
            ),
          );

          setRecommendationWarning(
            "Recommendations are using your last Spotify sync.",
          );
        } finally {
          setRefreshingRecommendations(
            false,
          );
        }
      },
      [
        connectivityStatus,
      ],
    );

  useReconnectReload(
    refreshRecommendations,
  );

  const recoverRecommendations =
    async (): Promise<void> => {
      if (
        recommendationIssue
          ?.action ===
        "reconnect-spotify"
      ) {
        router.push(
          "/music-services",
        );

        return;
      }

      const nextStatus =
        await refreshConnectivity();

      if (
        nextStatus !==
        "offline"
      ) {
        await refreshRecommendations();
      }
    };

  const recommended =
    rankSceneRecommendations(
      scenes,
      spotifySnapshot,
    )
      .slice(0, 3);

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={["top"]}
    >
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text
              style={
                styles.eyebrow
              }
            >
              CANAL
            </Text>

            <Text
              style={
                styles.title
              }
            >
              What should this moment sound like?
            </Text>

            <Text
              style={
                styles.subtitle
              }
            >
              Start something new, return to a Scene,
              or bring everyone together live.
            </Text>
          </View>

          <CanalHeaderActions showSettings={false} />
        </View>

        {history[0] ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Continue ${history[0].sceneName}`}
            onPress={() =>
              router.push({
                pathname: "/now-playing",
                params: {
                  sceneId:
                    history[0].sceneId,
                },
              } as never)
            }
            style={({ pressed }) => [
              styles.continueCard,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.continueCopy}>
              <Text style={styles.continueEyebrow}>
                CONTINUE LISTENING
              </Text>
              <Text numberOfLines={1} style={styles.continueTitle}>
                {history[0].sceneName}
              </Text>
            </View>
            <View style={styles.continuePlay}>
              <Text style={styles.continuePlayText}>▶</Text>
            </View>
          </Pressable>
        ) : null}

        <View style={styles.stageStrip}>
          <View style={styles.stageStripCopy}>
            <Text style={styles.stageStripEyebrow}>STAGE</Text>
            <Text style={styles.stageStripTitle}>Make the room part of the music.</Text>
            <Text style={styles.stageStripText}>Blend Scenes with friends and listen together live.</Text>
          </View>
          <View style={styles.stageStripActions}>
            <Pressable
              accessibilityLabel="Start a collaborative Stage"
              accessibilityRole="button"
              onPress={() => router.push("/create-stage")}
              style={({ pressed }) => [styles.stagePrimary, pressed && styles.pressed]}
            >
              <Text style={styles.stagePrimaryText}>Go Live</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Join a Stage with a code"
              accessibilityRole="button"
              onPress={() => router.push("/join-stage")}
              style={({ pressed }) => [styles.stageJoin, pressed && styles.pressed]}
            >
              <Text style={styles.stageJoinText}>Join code</Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push(
              "/scene-studio",
            )
          }
          style={({ pressed }) => [
            styles.hero,

            pressed &&
              styles.pressed,
          ]}
        >
          <View style={styles.heroOrb}>
            <Text
              style={
                styles.heroOrbText
              }
            >
              +
            </Text>
          </View>

          <View style={styles.heroText}>
            <Text
              style={
                styles.heroTitle
              }
            >
              Set the Scene
            </Text>

            <Text
              style={
                styles.heroDescription
              }
            >
              Choose the activity, mood,
              energy, and duration. Canal
              builds the sequence.
            </Text>
          </View>

          <Text
            style={
              styles.heroArrow
            }
          >
            ›
          </Text>
        </Pressable>

        {scenes.length === 0 ? (
          <EmptyScenes />
        ) : (
          <>
            <View
              style={
                styles.sectionHeader
              }
            >
              <View style={styles.sectionCopy}>
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Made for now
                </Text>

                <Text
                  style={
                    styles.sectionSubtitle
                  }
                >
                  Based on your latest Spotify
                  taste, favorites, plays, and
                  feedback.
                </Text>
              </View>

              <Pressable
                accessibilityLabel="See all Scenes"
                accessibilityRole="button"
                onPress={() =>
                  router.push(
                    "/(tabs)/library",
                  )
                }
                hitSlop={6}
                style={({ pressed }) => [
                  styles.seeAllButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={
                    styles.seeAll
                  }
                >
                  See all
                </Text>
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={
                false
              }
              contentContainerStyle={
                styles.horizontalScenes
              }
            >
              {recommended.map(
                (scene) => (
                  <SceneCard
                    key={scene.id}
                    scene={scene}
                    compact
                  />
                ),
              )}
            </ScrollView>

            {recommendationIssue ? (
              <RecoveryNotice
                busy={
                  refreshingRecommendations
                }
                issue={
                  recommendationIssue
                }
                onAction={
                  recoverRecommendations
                }
              />
            ) : recommendationWarning ? (
              <Text
                selectable
                style={
                  styles.recommendationWarning
                }
              >
                {recommendationWarning}
              </Text>
            ) : null}

            <View
              style={
                styles.sectionHeader
              }
            >
              <View>
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Recent Scenes
                </Text>

                <Text
                  style={
                    styles.sectionSubtitle
                  }
                >
                  Continue where you left off.
                </Text>
              </View>
            </View>

            {(recentScenes.length > 0
              ? recentScenes
              : scenes.slice(0, 4)
            ).map((scene) => (
              <SceneCard
                key={scene.id}
                scene={scene}
              />
            ))}
          </>
        )}

        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>
            Your Canal so far
          </Text>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text
                style={
                  styles.statValue
                }
              >
                {scenes.length}
              </Text>

              <Text
                style={
                  styles.statLabel
                }
              >
                Scenes
              </Text>
            </View>

            <View style={styles.stat}>
              <Text
                style={
                  styles.statValue
                }
              >
                {history.length}
              </Text>

              <Text
                style={
                  styles.statLabel
                }
              >
                Sessions
              </Text>
            </View>

            <View style={styles.stat}>
              <Text
                style={
                  styles.statValue
                }
              >
                {scenes.reduce(
                  (
                    total,
                    scene,
                  ) =>
                    total +
                    (scene.playCount ??
                      0),
                  0,
                )}
              </Text>

              <Text
                style={
                  styles.statLabel
                }
              >
                Plays
              </Text>
            </View>
          </View>
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
        "#080B0C",
    },

    content: {
      paddingHorizontal: 20,
      paddingBottom: 110,
    },

    header: {
      flexDirection: "row",
      alignItems:
        "flex-start",
      justifyContent:
        "space-between",
      paddingTop: 12,
      marginBottom: 22,
    },

    headerCopy: {
      flex: 1,
      minWidth: 0,
      paddingRight: 4,
    },

    eyebrow: {
      color: "#72D8C4",
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1.4,
    },

    title: {
      fontFamily: "Georgia",
      color: "#F7F4EC",
      fontSize: 38,
      lineHeight: 41,
      fontWeight: "500",
      letterSpacing: -1.1,
      marginTop: 4,
    },

    subtitle: {
      maxWidth: 280,
      color: "#A5AEA9",
      fontSize: 14,
      lineHeight: 20,
      marginTop: 5,
    },

    stageStrip: {
      gap: 14,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      backgroundColor: canalDynamicColors.surface,
      boxShadow: "0 16px 38px rgba(2, 24, 43, 0.12)",
      padding: 18,
      marginBottom: 18,
    },

    continueCard: {
      minHeight: 68,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      borderRadius: 19,
      borderWidth: 1,
      borderColor: "rgba(216, 255, 247, 0.22)",
      backgroundColor: "rgba(5, 42, 61, 0.52)",
      padding: 10,
      marginBottom: 11,
    },

    continueCopy: {
      flex: 1,
      minWidth: 0,
    },

    continueEyebrow: {
      color: "#CAFFF3",
      fontSize: 8,
      fontWeight: "800",
      letterSpacing: 1,
    },

    continueTitle: {
      color: "#FFFFFF",
      fontFamily: "Georgia",
      fontSize: 17,
      fontWeight: "500",
      marginTop: 3,
    },

    continuePlay: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 22,
      backgroundColor: "rgba(255,255,255,0.1)",
    },

    continuePlayText: {
      color: "#FFFFFF",
      fontSize: 15,
    },

    stageStripCopy: {
      gap: 4,
    },

    stageStripEyebrow: {
      color: "#72D8C4",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.3,
    },

    stageStripTitle: {
      color: "#F7F4EC",
      fontFamily: "Georgia",
      fontSize: 21,
      fontWeight: "900",
    },

    stageStripText: {
      color: canalDynamicColors.muted,
      fontSize: 13,
      lineHeight: 18,
    },

    stageStripActions: {
      flexDirection: "row",
      gap: 10,
    },

    stagePrimary: {
      minHeight: 48,
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 15,
      backgroundColor: "#72D8C4",
    },

    stagePrimaryText: {
      color: canalDynamicColors.onAccent,
      fontSize: 13,
      fontWeight: "900",
    },

    stageJoin: {
      minHeight: 48,
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 15,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
    },

    stageJoinText: {
      color: "#F7F4EC",
      fontSize: 13,
      fontWeight: "800",
    },

    hero: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor:
        canalDynamicColors.surface,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      borderRadius: 25,
      padding: 18,
      marginBottom: 27,
    },

    heroOrb: {
      width: 57,
      height: 57,
      borderRadius: 29,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        canalDynamicColors.mint,
      marginRight: 14,
    },

    heroOrbText: {
      color: "#10201C",
      fontSize: 30,
      lineHeight: 32,
    },

    heroText: {
      flex: 1,
    },

    heroTitle: {
      color: canalDynamicColors.text,
      fontSize: 19,
      fontWeight: "900",
    },

    heroDescription: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 4,
    },

    heroArrow: {
      color: "#72D8C4",
      fontSize: 30,
      marginLeft: 8,
    },

    emptyCard: {
      backgroundColor:
        "#0F1514",
      borderRadius: 22,
      padding: 20,
      marginBottom: 22,
    },

    emptyTitle: {
      color: "#F7F4EC",
      fontSize: 20,
      fontWeight: "900",
    },

    emptyText: {
      color: "#A5AEA9",
      fontSize: 14,
      lineHeight: 21,
      marginTop: 7,
      marginBottom: 16,
    },

    primaryButton: {
      minHeight: 50,
      borderRadius: 16,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        canalDynamicColors.mint,
    },

    primaryButtonText: {
      color: "#10201C",
      fontSize: 15,
      fontWeight: "800",
    },

    sectionHeader: {
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 12,
      marginBottom: 12,
      marginTop: 4,
    },

    sectionCopy: {
      flex: 1,
      minWidth: 0,
    },

    sectionTitle: {
      color: "#F7F4EC",
      fontSize: 20,
      fontWeight: "900",
    },

    sectionSubtitle: {
      color: "#A5AEA9",
      fontSize: 12,
      marginTop: 3,
    },

    seeAll: {
      color: "#72D8C4",
      fontSize: 13,
      fontWeight: "800",
    },

    seeAllButton: {
      minWidth: 62,
      minHeight: 48,
      flexShrink: 0,
      alignItems: "flex-end",
      justifyContent: "center",
      paddingHorizontal: 4,
    },

    horizontalScenes: {
      paddingRight: 10,
      paddingBottom: 23,
      gap: 12,
    },

    recommendationWarning: {
      color: "#F0D17E",
      fontSize: 12,
      lineHeight: 17,
      paddingHorizontal: 2,
    },

    compactSceneCard: {
      width: 215,
      minHeight: 190,
      backgroundColor:
        "#0F1514",
      borderRadius: 22,
      padding: 17,
    },

    sceneCard: {
      minHeight: 155,
      backgroundColor:
        "#0F1514",
      borderRadius: 21,
      padding: 17,
      marginBottom: 12,
    },

    sceneAccent: {
      width: 38,
      height: 5,
      borderRadius: 3,
      backgroundColor:
        "#72D8C4",
      marginBottom: 15,
    },

    sceneActivity: {
      color: "#72D8C4",
      fontSize: 10,
      fontWeight: "900",
      textTransform:
        "uppercase",
      letterSpacing: 0.9,
    },

    sceneName: {
      color: "#F7F4EC",
      fontSize: 20,
      fontWeight: "900",
      marginTop: 5,
    },

    sceneMood: {
      color: "#B8C3BE",
      fontSize: 13,
      lineHeight: 18,
      marginTop: 5,
    },

    sceneMeta: {
      color: "#A5AEA9",
      fontSize: 11,
      marginTop: 14,
    },

    favoriteMark: {
      position: "absolute",
      top: 16,
      right: 16,
      color: "#72D8C4",
      fontSize: 16,
    },

    statsCard: {
      backgroundColor:
        canalDynamicColors.surface,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      borderRadius: 22,
      padding: 18,
      marginTop: 10,
    },

    statsTitle: {
      color: "#F7F4EC",
      fontSize: 16,
      fontWeight: "900",
    },

    statsRow: {
      flexDirection: "row",
      marginTop: 15,
    },

    stat: {
      flex: 1,
      alignItems:
        "center",
    },

    statValue: {
      color: "#F7F4EC",
      fontSize: 24,
      fontWeight: "900",
    },

    statLabel: {
      color: "#A5AEA9",
      fontSize: 11,
      marginTop: 2,
    },

    pressed: {
      opacity: 0.7,
    },
  });
