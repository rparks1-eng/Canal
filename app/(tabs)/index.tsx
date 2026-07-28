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

        pressed &&
          styles.pressed,
      ]}
    >
      <View
        style={
          styles.sceneAccent
        }
      />

      <Text
        style={
          styles.sceneActivity
        }
      >
        {props.scene.activity}
      </Text>

      <Text
        numberOfLines={2}
        style={
          styles.sceneName
        }
      >
        {props.scene.name}
      </Text>

      <Text
        numberOfLines={2}
        style={
          styles.sceneMood
        }
      >
        {props.scene.emotions ||
          `${props.scene.energy} energy`}
      </Text>

      <Text
        style={
          styles.sceneMeta
        }
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
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <View style={styles.header}>
          <View>
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
              Find your sound.
            </Text>

            <Text
              style={
                styles.subtitle
              }
            >
              Music shaped around the moment,
              not just the genre.
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push(
                "/settings",
              )
            }
            style={({ pressed }) => [
              styles.spotifyButton,

              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.spotifyButtonText
              }
            >
              S
            </Text>
          </Pressable>
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
              <View>
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Recommended Scenes
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
                accessibilityRole="button"
                onPress={() =>
                  router.push(
                    "/(tabs)/library",
                  )
                }
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
        "#FFF9F4",
    },

    content: {
      paddingHorizontal: 20,
      paddingBottom: 40,
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

    eyebrow: {
      color: "#F47A24",
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1.4,
    },

    title: {
      color: "#181818",
      fontSize: 31,
      fontWeight: "900",
      marginTop: 4,
    },

    subtitle: {
      maxWidth: 280,
      color: "#6C655F",
      fontSize: 14,
      lineHeight: 20,
      marginTop: 5,
    },

    spotifyButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#1DB954",
    },

    spotifyButtonText: {
      color: "#FFFFFF",
      fontSize: 20,
      fontWeight: "900",
    },

    hero: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor:
        "#2B1710",
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
        "#F47A24",
      marginRight: 14,
    },

    heroOrbText: {
      color: "#FFFFFF",
      fontSize: 30,
      lineHeight: 32,
    },

    heroText: {
      flex: 1,
    },

    heroTitle: {
      color: "#FFFFFF",
      fontSize: 19,
      fontWeight: "900",
    },

    heroDescription: {
      color: "#DCC4B8",
      fontSize: 12,
      lineHeight: 18,
      marginTop: 4,
    },

    heroArrow: {
      color: "#FFB781",
      fontSize: 30,
      marginLeft: 8,
    },

    emptyCard: {
      backgroundColor:
        "#FFFFFF",
      borderRadius: 22,
      padding: 20,
      marginBottom: 22,
    },

    emptyTitle: {
      color: "#181818",
      fontSize: 20,
      fontWeight: "900",
    },

    emptyText: {
      color: "#6C655F",
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
        "#F47A24",
    },

    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "800",
    },

    sectionHeader: {
      flexDirection: "row",
      alignItems:
        "flex-end",
      justifyContent:
        "space-between",
      marginBottom: 12,
      marginTop: 4,
    },

    sectionTitle: {
      color: "#1B1B1B",
      fontSize: 20,
      fontWeight: "900",
    },

    sectionSubtitle: {
      color: "#77706A",
      fontSize: 12,
      marginTop: 3,
    },

    seeAll: {
      color: "#F47A24",
      fontSize: 13,
      fontWeight: "800",
    },

    horizontalScenes: {
      paddingRight: 10,
      paddingBottom: 23,
      gap: 12,
    },

    recommendationWarning: {
      color: "#7A5B12",
      fontSize: 12,
      lineHeight: 17,
      paddingHorizontal: 2,
    },

    compactSceneCard: {
      width: 215,
      minHeight: 190,
      backgroundColor:
        "#FFFFFF",
      borderRadius: 22,
      padding: 17,
    },

    sceneCard: {
      minHeight: 155,
      backgroundColor:
        "#FFFFFF",
      borderRadius: 21,
      padding: 17,
      marginBottom: 12,
    },

    sceneAccent: {
      width: 38,
      height: 5,
      borderRadius: 3,
      backgroundColor:
        "#F47A24",
      marginBottom: 15,
    },

    sceneActivity: {
      color: "#F47A24",
      fontSize: 10,
      fontWeight: "900",
      textTransform:
        "uppercase",
      letterSpacing: 0.9,
    },

    sceneName: {
      color: "#181818",
      fontSize: 20,
      fontWeight: "900",
      marginTop: 5,
    },

    sceneMood: {
      color: "#655F5A",
      fontSize: 13,
      lineHeight: 18,
      marginTop: 5,
    },

    sceneMeta: {
      color: "#8A827B",
      fontSize: 11,
      marginTop: 14,
    },

    favoriteMark: {
      position: "absolute",
      top: 16,
      right: 16,
      color: "#F47A24",
      fontSize: 16,
    },

    statsCard: {
      backgroundColor:
        "#F3ECE7",
      borderRadius: 22,
      padding: 18,
      marginTop: 10,
    },

    statsTitle: {
      color: "#332E2A",
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
      color: "#181818",
      fontSize: 24,
      fontWeight: "900",
    },

    statLabel: {
      color: "#746D67",
      fontSize: 11,
      marginTop: 2,
    },

    pressed: {
      opacity: 0.7,
    },
  });
