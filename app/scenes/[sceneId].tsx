import { canalDynamicColors } from "../../theme/canal-dynamic-colors";
import {
  use,
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
import { CanalAmbientBackground } from "../../components/canal-ui/canal-ambient-background";

import {
  Image,
} from "expo-image";

import {
  Ionicons,
} from "@expo/vector-icons";

import {
  RecoveryNotice,
} from "../../components/recovery-notice";

import {
  useCanalReduceTransparency,
} from "../../components/canal-ui/canal-primitives";

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
  exportSceneToMusicProvider,
} from "../../lib/scene-music-export";

import {
  addSpotifyArtworkToStoredScene,
} from "../../lib/spotify-scene-artwork";

import {
  deleteScene,
  duplicateScene,
  getSceneById,
  sceneDurationMinutes,
  sceneShareText,
  toggleSceneFavorite,
} from "../../lib/scenes";

import {
  syncScenesWithCloud,
} from "../../lib/scene-sync";

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
  useAuth,
} from "../../providers/auth-provider";

import {
  useConnectivity,
} from "../../providers/connectivity-provider";

import {
  CanalAtmosphereContext,
} from "../../theme/canal-atmosphere-context";

import {
  sceneAtmosphere,
  scenePresentation,
} from "../../components/canal-ui/scene-signature";

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
    setOverride,
  } = use(CanalAtmosphereContext);
  const reduceTransparency = useCanalReduceTransparency();
  const {
    user,
  } =
    useAuth();

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

  useFocusEffect(
    useCallback(() => {
      if (scene) {
        setOverride(sceneAtmosphere(scene));
      }

      return () => {
        setOverride(null);
      };
    }, [scene, setOverride]),
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
  const favoriteInFlight =
    useRef(false);
  const [favoriteBusy, setFavoriteBusy] =
    useState(false);
  const artworkLoadRef =
    useRef(0);

  const load =
    useCallback(() => {
      const run =
        async (): Promise<void> => {
          const artworkLoad = artworkLoadRef.current + 1;
          artworkLoadRef.current = artworkLoad;
          setLoading(true);

          let storedScene = sceneId
            ? await getSceneById(sceneId)
            : null;

          if (artworkLoadRef.current !== artworkLoad) {
            return;
          }

          if (storedScene) {
            setScene(storedScene);
            setLoading(false);
          }

          try {
            await syncScenesWithCloud();

            storedScene = sceneId
              ? await getSceneById(sceneId)
              : null;
          } catch (syncError) {
            console.warn(
              "Canal could not refresh this Scene from another device; showing the latest local copy instead:",
              syncError,
            );
          }

          if (artworkLoadRef.current !== artworkLoad) {
            return;
          }

          setScene(storedScene);

          setLoading(false);

          if (storedScene) {
            const enriched = await addSpotifyArtworkToStoredScene(storedScene);

            if (artworkLoadRef.current === artworkLoad) {
              setScene((current) =>
                current?.id === enriched.id
                  ? {
                      ...current,
                      tracks: enriched.tracks,
                    }
                  : current,
              );
            }
          }
        };

      void run();
    }, [sceneId]);

  useFocusEffect(load);

  const favorite =
    async (): Promise<void> => {
      if (!scene || favoriteInFlight.current) {
        return;
      }

      favoriteInFlight.current = true;
      setFavoriteBusy(true);
      setMessage("");

      const expectedSceneId = scene.id;
      const optimisticFavorite = !scene.favorite;
      setScene((current) =>
        current?.id === expectedSceneId
          ? {
              ...current,
              favorite: optimisticFavorite,
            }
          : current,
      );

      try {
        const updated =
          await toggleSceneFavorite(
            expectedSceneId,
          );

        setScene((current) =>
          current?.id === expectedSceneId
            ? {
                ...updated,
                tracks: current.tracks,
              }
            : current,
        );
      } catch (error) {
        const persisted =
          await getSceneById(
            expectedSceneId,
          ).catch(() => null);

        if (persisted) {
          setScene((current) =>
            current?.id === expectedSceneId
              ? {
                  ...persisted,
                  tracks: current.tracks,
                }
              : current,
          );
        } else {
          setScene((current) =>
            current?.id === expectedSceneId
              ? {
                  ...current,
                  favorite: !optimisticFavorite,
                }
              : current,
          );
        }

        setMessage(
          error instanceof Error
            ? error.message
            : "Canal could not update this favorite.",
        );
      } finally {
        favoriteInFlight.current = false;
        setFavoriteBusy(false);
      }
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
          await exportSceneToMusicProvider(
            scene,
            {
              providerId:
                "spotify",
              description:
                `A private Scene created in Canal for ${scene.activity.toLowerCase()}.`,
            },
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
                  .collectionId,
              playlistUrl:
                exportResult
                  .collectionUrl,
              trackCount:
                exportResult
                  .exportedTrackCount,
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
          `Created a Spotify playlist with ${exportResult.exportedTrackCount} tracks.${historyMessage}`,
        );

        setExportErrorCause(
          null,
        );

        const url =
          exportResult
            .collectionUrl;

        if (url) {
          try {
            await openTrack(url);
          } catch {
            setMessage(
              `Created a Spotify playlist with ${exportResult.exportedTrackCount} tracks. Open Spotify to find it.`,
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

  const presentation =
    scenePresentation(scene);

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={[
        "top",
        "bottom",
      ]}
    >
      <CanalAmbientBackground />
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Go back"
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
            reduceTransparency
              ? styles.solidSurface
              : styles.glassSurface,
            {
              borderColor:
                `${presentation.accent}55`,
            },

            pressed &&
              styles.pressed,
          ]}
        >
          <Ionicons color={canalDynamicColors.text} name="chevron-back" size={24} />
        </Pressable>

        <Pressable
          accessibilityLabel={
            scene.favorite
              ? "Remove Scene from favorites"
              : "Add Scene to favorites"
          }
          accessibilityRole="button"
          accessibilityState={{
            busy: favoriteBusy,
            selected: scene.favorite,
          }}
          disabled={favoriteBusy}
          onPress={() =>
            void favorite()
          }
          style={({ pressed }) => [
            styles.favoriteButton,
            pressed &&
              styles.pressed,
          ]}
        >
          <Ionicons
            color={scene.favorite ? presentation.accent : "#F7FFFC"}
            name={scene.favorite ? "star" : "star-outline"}
            size={22}
          />
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
        <View style={[
          styles.hero,
          reduceTransparency
            ? styles.solidSurface
            : styles.heroGlass,
        ]}>
          <View
            style={[
              styles.heroAccentLine,
              {
                backgroundColor: presentation.accent,
                boxShadow: `0 0 18px ${presentation.accent}88`,
              },
            ]}
          />

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
            accessibilityLabel="Start Scene"
            accessibilityRole="button"
            onPress={() =>
              void start()
            }
            style={({ pressed }) => [
              styles.startButton,
              {
                backgroundColor:
                  presentation.accent,
              },

              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.startButtonText,
                {
                  color:
                    presentation.accentText,
                },
              ]}
            >
              Start Scene
            </Text>
          </Pressable>
        </View>

        <View style={styles.actionGrid}>
          <Pressable
            accessibilityLabel="Create Snapshot"
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname:
                  "/snapshot-camera",

                params: {
                  sceneId:
                    scene.id,
                  sceneName:
                    scene.name,
                  source:
                    "scene",
                  trackId:
                    scene.tracks[0]?.id ?? "",
                  trackTitle:
                    scene.tracks[0]?.title ?? "",
                  trackArtist:
                    scene.tracks[0]?.artist ?? "",
                  trackImageUrl:
                    scene.tracks[0]?.imageUrl ?? "",
                  spotifyUrl:
                    scene.tracks[0]?.spotifyUrl ?? "",
                  mood:
                    scene.emotions,
                },
              })
            }
            style={({ pressed }) => [
              styles.actionButton,
              pressed &&
                styles.pressed,
            ]}
          >
            <Ionicons
              color={presentation.accent}
              name="camera-outline"
              size={23}
            />
          </Pressable>

          {scene.libraryType ===
            "created" &&
          user?.id ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Manage Scene collaboration"
              onPress={() =>
                router.push({
                  pathname:
                    "/scene-collaboration",

                  params: {
                    ownerId:
                      user.id,
                    sceneId:
                      scene.id,
                  },
                } as never)
              }
              style={({ pressed }) => [
                styles.actionButton,
                pressed &&
                  styles.pressed,
              ]}
            >
              <Ionicons
                color={presentation.accent}
                name="people-outline"
                size={23}
              />
            </Pressable>
          ) : null}

          <Pressable
            accessibilityLabel="Share Scene"
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
            <Ionicons
              color={presentation.accent}
              name="share-outline"
              size={23}
            />
          </Pressable>

          <Pressable
            accessibilityLabel="Duplicate Scene"
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
            <Ionicons
              color={presentation.accent}
              name="copy-outline"
              size={22}
            />
          </Pressable>

          <Pressable
            accessibilityLabel={
              exporting
                ? "Exporting Scene to Spotify"
                : "Export Scene to Spotify"
            }
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
            {exporting || checkingConnection ? (
              <ActivityIndicator
                color={presentation.accent}
                size="small"
              />
            ) : (
              <Ionicons
                color={presentation.accent}
                name="musical-notes-outline"
                size={23}
              />
            )}
          </Pressable>
        </View>

        {scene.tracks[0] ? (
          <Pressable
            accessibilityLabel={`Start Scene with ${scene.tracks[0].title}`}
            accessibilityRole="button"
            onPress={() => void start()}
            style={({ pressed }) => [
              styles.firstUp,
              reduceTransparency
                ? styles.solidSurface
                : styles.glassSurface,
              pressed && styles.pressed,
            ]}
          >
            {scene.tracks[0].imageUrl ? (
              <Image
                accessibilityLabel={`${scene.tracks[0].title} album artwork from Spotify`}
                contentFit="cover"
                source={{ uri: scene.tracks[0].imageUrl }}
                style={styles.firstUpArtwork}
                transition={120}
              />
            ) : (
              <View style={[styles.firstUpArtwork, styles.trackImagePlaceholder]} />
            )}

            <View style={styles.firstUpCopy}>
              <Text style={styles.firstUpKicker}>FIRST UP</Text>
              <Text numberOfLines={1} style={styles.firstUpTitle}>
                {scene.tracks[0].title}
              </Text>
              <Text numberOfLines={1} style={styles.firstUpArtist}>
                {scene.tracks[0].artist}
              </Text>
            </View>

            <View
              style={[
                styles.firstUpPlay,
                {
                  backgroundColor: presentation.accent,
                },
              ]}
            >
              <Text
                style={[
                  styles.firstUpPlayText,
                  {
                    color: presentation.accentText,
                  },
                ]}
              >
                Play
              </Text>
            </View>
          </Pressable>
        ) : null}

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

        <View style={[
          styles.sectionCard,
          reduceTransparency
            ? styles.solidSurface
            : styles.glassSurface,
        ]}>
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

        <View style={[
          styles.sectionCard,
          reduceTransparency
            ? styles.solidSurface
            : styles.glassSurface,
        ]}>
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
                  {track.imageUrl ? (
                    <Image
                      accessibilityLabel={`${track.title} album artwork from Spotify`}
                      contentFit="cover"
                      source={{ uri: track.imageUrl }}
                      style={styles.trackImage}
                      transition={120}
                    />
                  ) : (
                    <View
                      style={[
                        styles.trackImage,
                        styles.trackImagePlaceholder,
                      ]}
                    >
                      <Text style={styles.trackNumber}>{index + 1}</Text>
                    </View>
                  )}

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
        "transparent",
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
      color: canalDynamicColors.text,
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
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor: "rgba(5, 42, 66, 0.42)",
    },

    favoriteButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor: "rgba(5, 42, 66, 0.42)",
    },

    content: {
      paddingHorizontal: 20,
      paddingBottom: 110,
      gap: 15,
    },

    hero: {
      alignItems: "center",
      borderRadius: 27,
      paddingHorizontal: 20,
      paddingVertical: 27,
    },

    heroGlass: {
      backgroundColor: "rgba(5,42,66,0.58)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(220,255,249,0.22)",
    },

    firstUp: {
      minHeight: 76,
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 12,
    },

    firstUpArtwork: {
      width: 52,
      height: 52,
      borderRadius: 11,
      backgroundColor: "rgba(255,255,255,0.12)",
    },

    firstUpCopy: {
      flex: 1,
      minWidth: 0,
      paddingHorizontal: 12,
    },

    firstUpKicker: {
      color: canalDynamicColors.mint,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.8,
    },

    firstUpTitle: {
      color: canalDynamicColors.text,
      fontSize: 14,
      fontWeight: "900",
      marginTop: 3,
    },

    firstUpArtist: {
      color: "rgba(231,250,245,0.65)",
      fontSize: 11,
      marginTop: 2,
    },

    firstUpPlay: {
      minWidth: 58,
      minHeight: 44,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
    },

    firstUpPlayText: {
      fontSize: 12,
      fontWeight: "900",
    },

    heroAccentLine: {
      width: 42,
      height: 3,
      borderRadius: 999,
      marginBottom: 13,
    },

    heroActivity: {
      color: "#D8FFF8",
      fontSize: 11,
      fontWeight: "900",
      textTransform:
        "uppercase",
      letterSpacing: 1,
    },

    heroName: {
      color: canalDynamicColors.text,
      fontFamily: "Georgia",
      fontSize: 36,
      fontWeight: "500",
      textAlign: "center",
      letterSpacing: -0.8,
      marginTop: 6,
    },

    heroMood: {
      color: "#DEC7BC",
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
      marginTop: 7,
      paddingHorizontal: 28,
    },

    heroMeta: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 14,
      minHeight: 34,
      borderRadius: 999,
      backgroundColor: "rgba(5, 29, 60, 0.20)",
      borderWidth: 1,
      borderColor: "rgba(224, 255, 249, 0.12)",
      paddingHorizontal: 13,
      paddingVertical: 7,
    },

    heroMetaText: {
      color: canalDynamicColors.muted,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 0.25,
      textTransform:
        "capitalize",
    },

    heroMetaDot: {
      color: canalDynamicColors.muted,
      fontSize: 9,
      marginHorizontal: 6,
    },

    startButton: {
      minHeight: 54,
      width: "100%",
      borderRadius: 19,
      borderCurve: "continuous",
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F47A24",
      marginTop: 16,
      paddingHorizontal: 22,
      boxShadow: "0 14px 30px rgba(3, 27, 58, 0.18)",
    },

    startButtonText: {
      color: "#103835",
      fontSize: 16,
      fontWeight: "900",
    },

    actionGrid: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 10,
      paddingVertical: 4,
    },

    actionButton: {
      width: 52,
      height: 52,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(5, 42, 66, 0.44)",
      borderRadius: 26,
      borderCurve: "continuous",
      boxShadow: "0 8px 20px rgba(2, 22, 51, 0.14)",
    },

    actionTitle: {
      color: canalDynamicColors.text,
      fontSize: 13,
      fontWeight: "900",
      letterSpacing: -0.15,
    },

    actionText: {
      color: canalDynamicColors.muted,
      fontSize: 10,
      marginTop: 3,
    },

    disabled: {
      opacity: 0.45,
    },

    message: {
      backgroundColor: canalDynamicColors.successSurface,
      borderRadius: 16,
      padding: 14,
    },

    messageText: {
      color: "#1D7138",
      fontSize: 13,
      lineHeight: 19,
    },

    sectionCard: {
      backgroundColor: "rgba(5, 42, 66, 0.56)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(220, 255, 249, 0.20)",
      borderRadius: 22,
      padding: 18,
    },

    sectionTitle: {
      color: canalDynamicColors.text,
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
        "rgba(218, 255, 248, 0.24)",
      paddingVertical: 12,
    },

    detailLabel: {
      width: 95,
      color: canalDynamicColors.muted,
      fontSize: 12,
      fontWeight: "700",
    },

    detailValue: {
      flex: 1,
      color: canalDynamicColors.text,
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
        "rgba(218, 255, 248, 0.24)",
      paddingVertical: 12,
    },

    trackNumber: {
      color: "rgba(231, 250, 245, 0.56)",
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
        "#1E6682",
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
      color: canalDynamicColors.text,
      fontSize: 14,
      fontWeight: "800",
    },

    trackArtist: {
      color: "rgba(231, 250, 245, 0.62)",
      fontSize: 11,
      marginTop: 3,
    },

    trackArrow: {
      color: canalDynamicColors.muted,
      fontSize: 25,
      marginLeft: 8,
    },

    emptyTracks: {
      color: "rgba(231, 250, 245, 0.62)",
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
        "rgba(255, 171, 176, 0.52)",
      backgroundColor:
        "rgba(92, 25, 38, 0.68)",
    },

    deleteText: {
      color: "#FFD8DB",
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

    glassSurface: {
      backgroundColor: "rgba(5, 42, 66, 0.62)",
      borderColor: "rgba(220, 255, 249, 0.22)",
    },

    solidSurface: {
      backgroundColor: "#123F5D",
      borderColor: "#6B9CB0",
    },
  });
