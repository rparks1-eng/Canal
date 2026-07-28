import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
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

import {
  classifyAnalyticsFailure,
  recordAnalyticsEvent,
  recordAnalyticsFailure,
} from "../../lib/analytics";

import {
  classifyRecoveryIssue,
} from "../../lib/recovery-issue";

import {
  captureScenePlaylistExportAccount,
  recordScenePlaylistExport,
} from "../../lib/playlist-exports";

import {
  removeSavedSceneCompletely,
} from "../../lib/saved-scene-management";

import {
  exportSceneToSpotify,
} from "../../lib/spotify-scene-tools";

import {
  deleteScene,
  duplicateScene,
  getSceneById,
  sceneDurationMinutes,
  sceneShareText,
  toggleSceneFavorite,
} from "../../lib/scenes";

import type {
  StoredScene,
} from "../../lib/scenes";

import {
  canonicalSpotifyTrackUrl,
} from "../../lib/spotify-track-links";

import {
  createPlayerSession,
} from "../../lib/canal-player";

import {
  useConnectivity,
} from "../../providers/connectivity-provider";

async function openTrack(
  url?: string,
  uri?: string,
): Promise<void> {
  const target =
    canonicalSpotifyTrackUrl(
      url,
      uri,
    );

  if (!target) {
    return;
  }

  const canOpen =
    await Linking.canOpenURL(
      target,
    );

  if (canOpen) {
    await Linking.openURL(
      target,
    );
  }
}

export default function SceneDetailScreen() {
  const {
    refresh:
      refreshConnectivity,
    status:
      connectivityStatus,
  } =
    useConnectivity();

  const params =
    useLocalSearchParams<{
      sceneId?: string;
    }>();

  const sceneId =
    typeof params.sceneId ===
      "string"
      ? params.sceneId
      : "";

  const [
    scene,
    setScene,
  ] =
    useState<StoredScene | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    exporting,
    setExporting,
  ] = useState(false);

  const [
    checkingConnection,
    setCheckingConnection,
  ] = useState(false);

  const [
    exportErrorCause,
    setExportErrorCause,
  ] =
    useState<unknown>(
      null,
    );

  const [
    message,
    setMessage,
  ] = useState("");

  const exportInFlight =
    useRef(false);

  const load =
    useCallback(() => {
      const run =
        async (): Promise<void> => {
          setLoading(true);

          setScene(
            sceneId
              ? await getSceneById(
                  sceneId,
                )
              : null,
          );

          setLoading(false);
        };

      void run();
    }, [sceneId]);

  useFocusEffect(load);

  const favorite =
    async (): Promise<void> => {
      if (!scene) {
        return;
      }

      const updated =
        await toggleSceneFavorite(
          scene.id,
        );

      setScene(updated);
    };

  const start =
    async (): Promise<void> => {
      if (!scene) {
        return;
      }

      if (
        scene.tracks.length ===
        0
      ) {
        setMessage(
          "This Scene has no tracks.",
        );

        return;
      }

      await createPlayerSession(
        scene,
      );

      router.push({
        pathname:
          "/now-playing",

        params: {
          sceneId:
            scene.id,
        },
      });
    };

  const duplicate =
    async (): Promise<void> => {
      if (!scene) {
        return;
      }

      const copy =
        await duplicateScene(
          scene.id,
        );

      router.replace({
        pathname:
          "/scenes/[sceneId]",

        params: {
          sceneId:
            copy.id,
        },
      });
    };

  const share =
    async (): Promise<void> => {
      if (!scene) {
        return;
      }

      await Share.share({
        message:
          sceneShareText(
            scene,
          ),
      });
    };

  const exportToSpotify =
    async (
      confirmedConnectivityStatus =
        connectivityStatus,
      attempt:
        | "initial"
        | "retry" =
          "initial",
    ): Promise<void> => {
      if (
        !scene ||
        exporting ||
        checkingConnection ||
        exportInFlight.current
      ) {
        return;
      }

      if (
        confirmedConnectivityStatus ===
        "offline"
      ) {
        setMessage("");

        setExportErrorCause(
          new Error(
            "Canal is offline.",
          ),
        );

        return;
      }

      exportInFlight.current =
        true;

      setExporting(true);
      setMessage("");
      setExportErrorCause(
        null,
      );

      try {
        const exportAccount =
          await captureScenePlaylistExportAccount();

        const exportResult =
          await exportSceneToSpotify(
            scene,
            `A private Scene created in Canal for ${scene.activity.toLowerCase()}.`,
          );

        void recordAnalyticsEvent({
          name:
            "scene_export_completed",
          attempt,
        });

        let historyMessage =
          "";

        try {
          await recordScenePlaylistExport(
            scene,
            {
              playlistId:
                exportResult
                  .playlistId,
              playlistUrl:
                exportResult
                  .playlistUrl,
              trackCount:
                exportResult
                  .trackCount,
            },
            {
              sourceOwnerId:
                typeof scene
                  .sourceOwnerId ===
                  "string"
                  ? scene
                      .sourceOwnerId
                  : null,
              sourceSceneId:
                typeof scene
                  .sourceSceneId ===
                  "string"
                  ? scene
                      .sourceSceneId
                  : scene.id,
              account:
                exportAccount,
            },
          );
        } catch (
          historyError
        ) {
          console.warn(
            "Canal created the Spotify playlist but could not save its profile history:",
            historyError,
          );

          historyMessage =
            " Its Canal history could not be saved.";
        }

        setMessage(
          `Created a Spotify playlist with ${exportResult.trackCount} tracks.${historyMessage}`,
        );

        setExportErrorCause(
          null,
        );

        const url =
          exportResult
            .playlistUrl;

        if (url) {
          try {
            await openTrack(url);
          } catch {
            setMessage(
              `Created a Spotify playlist with ${exportResult.trackCount} tracks. Open Spotify to find it.`,
            );
          }
        }
      } catch (error) {
        void recordAnalyticsFailure(
          "scene_export",
          classifyAnalyticsFailure(
            error,
          ),
          attempt,
        );

        setExportErrorCause(
          () =>
            error ??
            new Error(
              "Canal could not export this Scene.",
            ),
        );

        setMessage("");
      } finally {
        exportInFlight.current =
          false;

        setExporting(false);
      }
    };

  const exportRecoveryIssue =
    useMemo(
      () => {
        const cause =
          exportErrorCause ??
          (
            connectivityStatus ===
              "offline"
              ? new Error(
                  "Canal is offline.",
                )
              : null
          );

        return cause
          ? classifyRecoveryIssue(
              cause,
              {
                service:
                  "spotify",
                connectivityStatus,
              },
            )
          : null;
      },
      [
        connectivityStatus,
        exportErrorCause,
      ],
    );

  const recoverExport =
    async (): Promise<void> => {
      if (
        exportRecoveryIssue
          ?.action ===
        "reconnect-spotify"
      ) {
        router.push(
          "/music-services",
        );

        return;
      }

      const shouldRetryExport =
        exportErrorCause !==
        null;

      setCheckingConnection(
        true,
      );

      try {
        const nextStatus =
          await refreshConnectivity();

        if (
          nextStatus !==
            "offline" &&
          shouldRetryExport
        ) {
          await exportToSpotify(
            nextStatus,
            "retry",
          );
        }
      } finally {
        setCheckingConnection(
          false,
        );
      }
    };

  const confirmDelete =
    (): void => {
      if (!scene) {
        return;
      }

      Alert.alert(
        "Delete Scene?",
        `"${scene.name}" will be removed from this device.`,
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Delete",
            style:
              "destructive",

            onPress: () => {
              const run =
                async (): Promise<void> => {
                  if (
                    scene.libraryType ===
                    "saved"
                  ) {
                    await removeSavedSceneCompletely(
                      scene,
                    );
                  } else {
                    await deleteScene(
                      scene.id,
                    );
                  }

                  router.replace(
                    "/(tabs)/library",
                  );
                };

              void run();
            },
          },
        ],
      );
    };

  if (loading) {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <View
          style={
            styles.center
          }
        >
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  if (!scene) {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <View
          style={
            styles.center
          }
        >
          <Text
            style={
              styles.missingTitle
            }
          >
            Scene not found
          </Text>

          <Pressable
            onPress={() =>
              router.replace(
                "/(tabs)/library",
              )
            }
            style={
              styles.primaryButton
            }
          >
            <Text
              style={
                styles.primaryButtonText
              }
            >
              Open Library
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={[
        "top",
        "bottom",
      ]}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(tabs)");
            }
          }}
          style={({ pressed }) => [
            styles.backButton,

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

        <Pressable
          accessibilityRole="button"
          onPress={() =>
            void favorite()
          }
          style={({ pressed }) => [
            styles.favoriteButton,

            pressed &&
              styles.pressed,
          ]}
        >
          <Text
            style={[
              styles.favoriteText,

              scene.favorite &&
                styles.favoriteTextActive,
            ]}
          >
            {scene.favorite
              ? "★"
              : "☆"}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <View style={styles.hero}>
          <Text
            style={
              styles.heroActivity
            }
          >
            {scene.activity}
          </Text>

          <Text
            style={
              styles.heroName
            }
          >
            {scene.name}
          </Text>

          <Text
            style={
              styles.heroMood
            }
          >
            {scene.emotions ||
              `${scene.energy} energy`}
          </Text>

          <View style={styles.heroMeta}>
            <Text
              style={
                styles.heroMetaText
              }
            >
              {scene.tracks.length} tracks
            </Text>

            <Text
              style={
                styles.heroMetaDot
              }
            >
              •
            </Text>

            <Text
              style={
                styles.heroMetaText
              }
            >
              {sceneDurationMinutes(
                scene,
              )}{" "}
              minutes
            </Text>

            <Text
              style={
                styles.heroMetaDot
              }
            >
              •
            </Text>

            <Text
              style={
                styles.heroMetaText
              }
            >
              {scene.playCount ?? 0} plays
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              void start()
            }
            style={({ pressed }) => [
              styles.startButton,

              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.startButtonText
              }
            >
              Start Scene
            </Text>
          </Pressable>
        </View>

        <View style={styles.actionGrid}>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname:
                  "/scene-snapshot",

                params: {
                  sceneId:
                    scene.id,
                },
              })
            }
            style={({ pressed }) => [
              styles.actionButton,

              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.actionTitle
              }
            >
              Snapshot
            </Text>

            <Text
              style={
                styles.actionText
              }
            >
              Share the Scene
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              void share()
            }
            style={({ pressed }) => [
              styles.actionButton,

              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.actionTitle
              }
            >
              Share
            </Text>

            <Text
              style={
                styles.actionText
              }
            >
              Open share sheet
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              void duplicate()
            }
            style={({ pressed }) => [
              styles.actionButton,

              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.actionTitle
              }
            >
              Duplicate
            </Text>

            <Text
              style={
                styles.actionText
              }
            >
              Make a copy
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{
              busy:
                exporting ||
                checkingConnection,
              disabled:
                exporting ||
                checkingConnection ||
                connectivityStatus ===
                  "offline",
            }}
            disabled={
              exporting ||
              checkingConnection ||
              connectivityStatus ===
                "offline"
            }
            onPress={() =>
              void exportToSpotify()
            }
            style={({ pressed }) => [
              styles.actionButton,

              (
                exporting ||
                checkingConnection ||
                connectivityStatus ===
                  "offline"
              ) &&
                styles.disabled,

              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.actionTitle
              }
            >
              {exporting
                ? "Exporting"
                : checkingConnection
                  ? "Checking"
                : "Spotify"}
            </Text>

            <Text
              style={
                styles.actionText
              }
            >
              Create playlist
            </Text>
          </Pressable>
        </View>

        {exportRecoveryIssue ? (
          <RecoveryNotice
            busy={
              exporting ||
              checkingConnection
            }
            issue={
              exportRecoveryIssue
            }
            onAction={
              recoverExport
            }
          />
        ) : null}

        {message ? (
          <View style={styles.message}>
            <Text
              style={
                styles.messageText
              }
            >
              {message}
            </Text>
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <Text
            style={
              styles.sectionTitle
            }
          >
            Scene profile
          </Text>

          {[
            [
              "Genres",
              scene.genres ||
                "Spotify taste",
            ],
            [
              "Artists",
              scene.artists ||
                "Multiple artists",
            ],
            [
              "Energy",
              scene.energy,
            ],
            [
              "Familiarity",
              scene.familiarity,
            ],
            [
              "Visibility",
              scene.visibility,
            ],
          ].map(
            ([label, value]) => (
              <View
                key={label}
                style={
                  styles.detailRow
                }
              >
                <Text
                  style={
                    styles.detailLabel
                  }
                >
                  {label}
                </Text>

                <Text
                  style={
                    styles.detailValue
                  }
                >
                  {value}
                </Text>
              </View>
            ),
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text
            style={
              styles.sectionTitle
            }
          >
            Track sequence
          </Text>

          {scene.tracks.length === 0 ? (
            <Text
              style={
                styles.emptyTracks
              }
            >
              This Scene has no saved tracks.
            </Text>
          ) : (
            scene.tracks.map(
              (track, index) => (
                <Pressable
                  key={`${track.id}-${index}`}
                  accessibilityRole="button"
                  onPress={() =>
                    void openTrack(
                      track.spotifyUrl,
                      track.spotifyUri,
                    )
                  }
                  style={({ pressed }) => [
                    styles.trackRow,

                    pressed &&
                      styles.pressed,
                  ]}
                >
                  <View
                    style={[
                      styles.trackImage,
                      styles.trackImagePlaceholder,
                    ]}
                  >
                    <Text
                      style={
                        styles.trackNumber
                      }
                    >
                      {index + 1}
                    </Text>
                  </View>

                  <View
                    style={
                      styles.trackText
                    }
                  >
                    <Text
                      numberOfLines={1}
                      style={
                        styles.trackTitle
                      }
                    >
                      {track.title}
                    </Text>

                    <Text
                      numberOfLines={1}
                      style={
                        styles.trackArtist
                      }
                    >
                      {track.artist}
                    </Text>
                  </View>

                  <Text
                    style={
                      styles.trackArrow
                    }
                  >
                    ›
                  </Text>
                </Pressable>
              ),
            )
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={
            confirmDelete
          }
          style={({ pressed }) => [
            styles.deleteButton,

            pressed &&
              styles.pressed,
          ]}
        >
          <Text
            style={
              styles.deleteText
            }
          >
            Delete Scene
          </Text>
        </Pressable>
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

    center: {
      flex: 1,
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingHorizontal: 25,
    },

    missingTitle: {
      color: "#181818",
      fontSize: 22,
      fontWeight: "900",
      marginBottom: 16,
    },

    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 12,
    },

    backButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#FFFFFF",
    },

    backText: {
      color: "#1B1B1B",
      fontSize: 34,
      lineHeight: 36,
      marginTop: -2,
    },

    favoriteButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#FFFFFF",
    },

    favoriteText: {
      color: "#8A827B",
      fontSize: 23,
    },

    favoriteTextActive: {
      color: "#F47A24",
    },

    content: {
      paddingHorizontal: 20,
      paddingBottom: 45,
      gap: 15,
    },

    hero: {
      alignItems: "center",
      backgroundColor:
        "#2B1710",
      borderRadius: 27,
      paddingHorizontal: 20,
      paddingVertical: 27,
    },

    heroActivity: {
      color: "#FFB781",
      fontSize: 11,
      fontWeight: "900",
      textTransform:
        "uppercase",
      letterSpacing: 1,
    },

    heroName: {
      color: "#FFFFFF",
      fontSize: 29,
      fontWeight: "900",
      textAlign: "center",
      marginTop: 6,
    },

    heroMood: {
      color: "#DEC7BC",
      fontSize: 14,
      textAlign: "center",
      marginTop: 6,
    },

    heroMeta: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 16,
    },

    heroMetaText: {
      color: "#BFA99F",
      fontSize: 10,
      textTransform:
        "capitalize",
    },

    heroMetaDot: {
      color: "#806C63",
      fontSize: 9,
      marginHorizontal: 6,
    },

    startButton: {
      minHeight: 50,
      minWidth: 190,
      borderRadius: 17,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F47A24",
      marginTop: 20,
      paddingHorizontal: 22,
    },

    startButtonText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "900",
    },

    actionGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },

    actionButton: {
      width: "48%",
      minHeight: 77,
      justifyContent:
        "center",
      backgroundColor:
        "#FFFFFF",
      borderRadius: 18,
      paddingHorizontal: 14,
    },

    actionTitle: {
      color: "#25211F",
      fontSize: 14,
      fontWeight: "900",
    },

    actionText: {
      color: "#807871",
      fontSize: 10,
      marginTop: 3,
    },

    disabled: {
      opacity: 0.45,
    },

    message: {
      backgroundColor:
        "#EAF9EF",
      borderRadius: 16,
      padding: 14,
    },

    messageText: {
      color: "#1D7138",
      fontSize: 13,
      lineHeight: 19,
    },

    sectionCard: {
      backgroundColor:
        "#FFFFFF",
      borderRadius: 22,
      padding: 18,
    },

    sectionTitle: {
      color: "#1B1B1B",
      fontSize: 19,
      fontWeight: "900",
      marginBottom: 8,
    },

    detailRow: {
      flexDirection: "row",
      alignItems:
        "flex-start",
      justifyContent:
        "space-between",
      borderTopWidth: 1,
      borderTopColor:
        "#F0ECE8",
      paddingVertical: 12,
    },

    detailLabel: {
      width: 95,
      color: "#77706A",
      fontSize: 12,
      fontWeight: "700",
    },

    detailValue: {
      flex: 1,
      color: "#2D2926",
      fontSize: 12,
      lineHeight: 18,
      textAlign: "right",
      textTransform:
        "capitalize",
    },

    trackRow: {
      flexDirection: "row",
      alignItems: "center",
      borderTopWidth: 1,
      borderTopColor:
        "#F0ECE8",
      paddingVertical: 12,
    },

    trackNumber: {
      color: "#918981",
      fontSize: 11,
      fontWeight: "800",
      textAlign: "center",
    },

    trackImage: {
      width: 48,
      height: 48,
      borderRadius: 10,
      borderCurve:
        "continuous",
      backgroundColor:
        "#F1E7DF",
      marginRight: 10,
    },

    trackImagePlaceholder: {
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    trackText: {
      flex: 1,
      minWidth: 0,
    },

    trackTitle: {
      color: "#25211F",
      fontSize: 14,
      fontWeight: "800",
    },

    trackArtist: {
      color: "#77706A",
      fontSize: 11,
      marginTop: 3,
    },

    trackArrow: {
      color: "#AAA19A",
      fontSize: 25,
      marginLeft: 8,
    },

    emptyTracks: {
      color: "#77706A",
      fontSize: 13,
      lineHeight: 19,
      paddingTop: 8,
    },

    deleteButton: {
      minHeight: 49,
      borderRadius: 16,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderWidth: 1,
      borderColor:
        "#DBAAA5",
      backgroundColor:
        "#FFF8F7",
    },

    deleteText: {
      color: "#A62E27",
      fontSize: 14,
      fontWeight: "800",
    },

    primaryButton: {
      minHeight: 49,
      borderRadius: 15,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F47A24",
      paddingHorizontal: 22,
    },

    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "800",
    },

    pressed: {
      opacity: 0.7,
    },
  });
