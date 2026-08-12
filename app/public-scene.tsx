import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  router,
  useLocalSearchParams,
} from "expo-router";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  RecoveryNotice,
} from "../components/recovery-notice";
import { ProfileAvatar } from "../components/profile-avatar";
import { PublicSnapshotGrid } from "../components/PublicSnapshotCard";
import { Image } from "expo-image";
import { SceneCardBackdrop } from "../components/canal-ui/scene-card-visual";
import { SceneDnaPanel } from "../components/canal-ui/scene-dna-panel";
import { scenePresentation } from "../components/canal-ui/scene-signature";
import { CanalAmbientBackground } from "../components/canal-ui/canal-ambient-background";
import { canalDynamicColors } from "../theme/canal-dynamic-colors";

import {
  classifyAnalyticsFailure,
  recordAnalyticsEvent,
  recordAnalyticsFailure,
} from "../lib/analytics";

import {
  classifyRecoveryIssue,
} from "../lib/recovery-issue";

import {
  captureScenePlaylistExportAccount,
  recordScenePlaylistExport,
} from "../lib/playlist-exports";

import {
  publicSceneShareUrl,
  sceneShareText,
} from "../lib/scenes";

import {
  loadPublicScene,
  savePublicSceneToLibrary,
} from "../lib/social";
import {
  addSpotifyArtworkToStoredScene,
} from "../lib/spotify-scene-artwork";

import type {
  PublicCanalScene,
} from "../lib/social";
import {
  loadPublicSourceSnapshots,
} from "../lib/public-snapshots";
import type {
  PublicCanalSnapshot,
} from "../lib/public-snapshots";

import {
  exportSceneToMusicProvider,
} from "../lib/scene-music-export";

import type {
  MusicProviderId,
} from "../lib/music-provider-model";

import {
  CanalAlert,
} from "../lib/canal-alert";

import {
  useConnectivity,
} from "../providers/connectivity-provider";

import { canalTypography } from "../theme/canal-typography";

function safeBack(): void {
  if (
    router.canGoBack()
  ) {
    router.back();

    return;
  }

  router.replace(
    "/(tabs)/explore" as never,
  );
}

export default function PublicSceneScreen() {
  const {
    refresh:
      refreshConnectivity,
    status:
      connectivityStatus,
  } =
    useConnectivity();

  const params =
    useLocalSearchParams<{
      ownerId?: string;
      sceneId?: string;
    }>();

  const ownerId =
    typeof params.ownerId ===
      "string"
      ? params.ownerId
      : "";

  const sceneId =
    typeof params.sceneId ===
      "string"
      ? params.sceneId
      : "";

  const [
    item,
    setItem,
  ] =
    useState<
      PublicCanalScene | null
    >(
      null,
    );

  const [sceneSnapshots, setSceneSnapshots] = useState<PublicCanalSnapshot[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    playing,
    setPlaying,
  ] = useState(false);

  const [
    sharing,
    setSharing,
  ] = useState(false);

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
    playlistUrl,
    setPlaylistUrl,
  ] =
    useState<
      string | null
    >(
      null,
    );

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const exportInFlight =
    useRef(false);
  const saveInFlight =
    useRef(false);
  const playInFlight =
    useRef(false);
  const shareInFlight =
    useRef(false);
  const loadGeneration =
    useRef(0);
  const load =
    useCallback(
      async (): Promise<void> => {
        const generation = ++loadGeneration.current;
        if (
          !ownerId ||
          !sceneId
        ) {
          setErrorMessage(
            "The public Scene address is incomplete.",
          );

          setLoading(
            false,
          );

          return;
        }

        setLoading(
          true,
        );
        setItem(null);
        setSceneSnapshots([]);

        try {
          const publicScene =
            await loadPublicScene(
              ownerId,
              sceneId,
            );

          if (generation !== loadGeneration.current) return;
          setItem(publicScene);

          if (publicScene.scene.tracks.some((track) => !track.imageUrl)) {
            void addSpotifyArtworkToStoredScene(publicScene.scene)
              .then((sceneWithArtwork) => {
                if (generation !== loadGeneration.current) return;

                setItem((current) =>
                  current?.ownerId === publicScene.ownerId &&
                  current.sceneId === publicScene.sceneId
                    ? { ...current, scene: sceneWithArtwork }
                    : current,
                );
              })
              .catch(() => undefined);
          }

          try {
            const snapshots = await loadPublicSourceSnapshots(sceneId, ownerId);
            if (generation !== loadGeneration.current) return;
            setSceneSnapshots(snapshots);
          } catch (snapshotError) {
            console.warn("Public Scene Snapshots are temporarily unavailable:", snapshotError);
            if (generation === loadGeneration.current) setSceneSnapshots([]);
          }

          if (generation === loadGeneration.current) setErrorMessage("");
        } catch (error) {
          if (generation !== loadGeneration.current) return;
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Canal could not load this public Scene.",
          );
        } finally {
          if (generation === loadGeneration.current) setLoading(false);
        }
      },
      [
        ownerId,
        sceneId,
      ],
    );

  useEffect(() => {
    void load();
    return () => {
      loadGeneration.current += 1;
    };
  }, [
    load,
  ]);

  const save =
    async (): Promise<void> => {
      if (
        saveInFlight.current ||
        !item ||
        saving
      ) {
        return;
      }

      saveInFlight.current =
        true;
      setSaving(
        true,
      );

      setMessage("");
      setErrorMessage("");
      setExportErrorCause(
        null,
      );

      try {
        await savePublicSceneToLibrary(
          item,
        );

        setItem({
          ...item,

          savedByMe:
            true,
        });

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
        saveInFlight.current =
          false;
        setSaving(
          false,
        );
      }
    };

  const play =
    async (): Promise<void> => {
      if (
        playInFlight.current ||
        !item ||
        playing
      ) {
        return;
      }

      playInFlight.current =
        true;
      setPlaying(
        true,
      );
      setErrorMessage("");

      try {
        const playableScene =
          item.isMine
            ? item.scene
            : await savePublicSceneToLibrary(
                item,
              );

        setItem((current) =>
          current?.ownerId === item.ownerId &&
          current.sceneId === item.sceneId
            ? {
                ...current,
                savedByMe: true,
              }
            : current,
        );

        router.push({
          pathname: "/now-playing",
          params: {
            sceneId: playableScene.id,
          },
        } as never);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not prepare this Scene for playback.",
        );
      } finally {
        playInFlight.current =
          false;
        setPlaying(
          false,
        );
      }
    };

  const share =
    async (): Promise<void> => {
      if (
        shareInFlight.current ||
        !item ||
        sharing
      ) {
        return;
      }

      shareInFlight.current =
        true;
      setSharing(
        true,
      );
      setErrorMessage("");

      try {
        const returnUrl =
          publicSceneShareUrl(
            item.ownerId,
            item.sceneId,
          );

        await Share.share({
          title:
            item.scene.name,
          message:
            sceneShareText(
              item.scene,
              returnUrl,
            ),
          url:
            returnUrl,
        });
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not share this public Scene.",
        );
      } finally {
        shareInFlight.current =
          false;
        setSharing(
          false,
        );
      }
    };

  const lastExportProvider =
    useRef<MusicProviderId>("spotify");

  const exportToMusicProvider =
    async (
      confirmedConnectivityStatus =
        connectivityStatus,
      providerId: MusicProviderId =
        "spotify",
    ): Promise<void> => {
      if (
        !item ||
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
        void recordAnalyticsFailure(
          "scene_export",
          "offline",
        );

        setMessage("");
        setErrorMessage("");

        setExportErrorCause(
          new Error(
            "Canal is offline.",
          ),
        );

        return;
      }

      exportInFlight.current =
        true;
      lastExportProvider.current =
        providerId;

      setExporting(
        true,
      );

      setMessage("");
      setErrorMessage("");
      setExportErrorCause(
        null,
      );
      setPlaylistUrl(
        null,
      );

      try {
        const exportAccount =
          await captureScenePlaylistExportAccount();

        const result =
          await exportSceneToMusicProvider(
            item.scene,
            {
              providerId:
                providerId,
              description:
                `A public Canal Scene by ${item.creator.displayName} ${item.creator.handle}.`,
            },
          );

        void recordAnalyticsEvent({
          name:
            "scene_export_completed",
        });

        setPlaylistUrl(
          result.collectionUrl,
        );

        let historyMessage =
          "";

        try {
          await recordScenePlaylistExport(
            item.scene,
            {
              playlistId:
                result
                  .collectionId,
              playlistUrl:
                result
                  .collectionUrl,
              trackCount:
                result
                  .exportedTrackCount,
            },
            {
              sourceOwnerId:
                item.ownerId,
              sourceSceneId:
                item.sceneId,
              account:
                exportAccount,
            },
          );
        } catch (
          historyError
        ) {
          console.warn(
            `Canal created the ${providerId === "spotify" ? "Spotify" : "Apple Music"} playlist but could not save its profile history:`,
            historyError,
          );

          historyMessage =
            " The playlist was created, but its Canal history could not be saved.";
        }

        setMessage(
          `Exported ${result.exportedTrackCount} track${result.exportedTrackCount === 1 ? "" : "s"} to ${providerId === "spotify" ? "Spotify" : "Apple Music"}. ${
            result.skippedTrackCount > 0
              ? `${result.skippedTrackCount} unmatched track${result.skippedTrackCount === 1 ? " was" : "s were"} skipped.`
              : ""
          }${historyMessage}`,
        );

        setExportErrorCause(
          null,
        );
      } catch (error) {
        void recordAnalyticsFailure(
          "scene_export",
          classifyAnalyticsFailure(
            error,
          ),
        );

        setExportErrorCause(
          () =>
            error ??
            new Error(
              "Canal could not export this Scene playlist.",
            ),
        );
      } finally {
        exportInFlight.current =
          false;

        setExporting(
          false,
        );
      }
    };

  const exportRecoveryIssue =
    useMemo(
      () => {
        const cause =
          exportErrorCause ??
          (
            item &&
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
        item,
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
          "/music-services" as never,
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
          await exportToMusicProvider(
            nextStatus,
            lastExportProvider.current,
          );
        }
      } finally {
        setCheckingConnection(
          false,
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
        "bottom",
      ]}
    >
      <CanalAmbientBackground />
      <View
        style={
          styles.header
        }
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back from Public Scene"
          onPress={
            safeBack
          }
          style={
            styles.backButton
          }
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
          Public Scene
        </Text>

        <View
          style={
            styles.headerSpacer
          }
        />
      </View>

      {loading ? (
        <View
          style={
            styles.loading
          }
        >
          <ActivityIndicator
            size="large"
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={
            styles.content
          }
          showsVerticalScrollIndicator={
            false
          }
        >
          {item ? (
            <>
              <View
                style={
                  styles.hero
                }
              >
                <SceneCardBackdrop presentation={scenePresentation(item.scene)} scene={item.scene} />
                <Text style={styles.publicKicker}>PUBLIC SCENE</Text>
                <Text
                  style={
                    styles.sceneName
                  }
                >
                  {item.scene.name}
                </Text>

                <Text
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

                <SceneDnaPanel accent={scenePresentation(item.scene).accent} scene={item.scene} />

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open creator ${item.creator.displayName}`}
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
                  style={
                    styles.creatorButton
                  }
                >
                  <ProfileAvatar
                    avatarUrl={item.creator.avatarUrl}
                    displayName={item.creator.displayName}
                    size={34}
                  />
                  <Text
                    style={
                      styles.creatorText
                    }
                  >
                    By{" "}
                    {item.creator.displayName}{" "}
                    {item.creator.handle}
                    {item.creator
                      .isCanal
                      ? " · CANAL"
                      : item.creator
                          .isVerified
                        ? " · VERIFIED"
                        : ""}
                  </Text>
                </Pressable>

                <View style={styles.primaryActions}>
                  <Pressable
                    accessibilityHint={item.isMine ? "Start this Scene." : "Saves a private copy to your Library the first time, then starts the Scene."}
                    accessibilityLabel={`Play ${item.scene.name}`}
                    accessibilityRole="button"
                    accessibilityState={{ busy: playing }}
                    disabled={playing}
                    onPress={() => void play()}
                    style={[styles.playSceneButton, { backgroundColor: scenePresentation(item.scene).accent }]}
                  >
                    {playing ? <ActivityIndicator color={scenePresentation(item.scene).accentText} /> : <Ionicons color={scenePresentation(item.scene).accentText} name="play" size={18} />}
                    <Text style={[styles.playSceneText, { color: scenePresentation(item.scene).accentText }]}>Play Scene</Text>
                  </Pressable>
                  <Pressable
                    accessibilityHint="Use this Scene as inspiration and optionally blend it with personal Scenes from your Library."
                    accessibilityLabel={`Reshoot ${item.scene.name}`}
                    accessibilityRole="button"
                    onPress={() => router.push({ pathname: "/scene-reshoot", params: { ownerId: item.ownerId, sceneId: item.sceneId } } as never)}
                    style={[styles.reshootButton, { backgroundColor: scenePresentation(item.scene).accent }]}
                  >
                    <Ionicons color={scenePresentation(item.scene).accentText} name="color-wand-outline" size={20} />
                    <Text style={[styles.reshootText, { color: scenePresentation(item.scene).accentText }]}>Reshoot</Text>
                  </Pressable>
                </View>
                <View style={styles.secondaryActions}>
                  <PublicAction accessibilityLabel={item.isMine ? "Your Scene" : item.savedByMe ? "Saved private copy" : "Save Private Copy"} busy={saving} disabled={item.isMine || item.savedByMe || saving} icon={item.savedByMe ? "checkmark" : "bookmark-outline"} label={item.isMine ? "Yours" : item.savedByMe ? "Saved" : "Save"} onPress={() => void save()} />
                  <PublicAction
                    accessibilityLabel="Export Public Scene playlist"
                    busy={exporting || checkingConnection}
                    disabled={exporting || checkingConnection || connectivityStatus === "offline"}
                    icon="musical-notes-outline"
                    label="Export"
                    onPress={() => {
                      CanalAlert.alert(
                        "Export Scene playlist",
                        "Choose where Canal should create this playlist.",
                        [
                          {
                            text: "Spotify",
                            onPress: () => void exportToMusicProvider(connectivityStatus, "spotify"),
                          },
                          {
                            text: "Apple Music",
                            onPress: () => void exportToMusicProvider(connectivityStatus, "apple-music"),
                          },
                          { text: "Cancel", style: "cancel" },
                        ],
                      );
                    }}
                  />
                  <PublicAction accessibilityHint="Opens your system sharing options." accessibilityLabel={`Share ${item.scene.name}`} busy={sharing} disabled={sharing} icon="share-outline" label="Share" onPress={() => void share()} />
                </View>
              </View>

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

                  {playlistUrl ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        void Linking.openURL(
                          playlistUrl,
                        )
                      }
                      style={
                        styles.openSpotifyButton
                      }
                    >
                      <Text
                        style={
                          styles.openSpotifyText
                        }
                      >
                        Open Playlist in Spotify
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
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

              {errorMessage ? (
                <View
                  accessibilityLiveRegion="polite"
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

              <View
                style={
                  styles.detailCard
                }
              >
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Scene details
                </Text>

                <Detail
                  label="Mood"
                  value={
                    item.scene.emotions
                  }
                />

                <Detail
                  label="Energy"
                  value={
                    item.scene.energy
                  }
                />

                <Detail
                  label="Genres"
                  value={
                    item.scene.genres
                  }
                />

                <Detail
                  label="Discovery"
                  value={
                    item.scene.familiarity
                  }
                />
              </View>

              {sceneSnapshots.length > 0 ? (
                <View style={styles.detailCard}>
                  <Text style={styles.sectionTitle}>Snapshots from this Scene</Text>
                  <Text style={styles.sectionDescription}>
                    Visual moments published from this Scene.
                  </Text>
                  <PublicSnapshotGrid snapshots={sceneSnapshots} />
                </View>
              ) : null}

              <View
                style={
                  styles.detailCard
                }
              >
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Tracks
                </Text>

                {item.scene.tracks.map(
                  (
                    track,
                    index,
                  ) => (
                    <Pressable
                      accessibilityLabel={`Open song context for ${track.title}`}
                      accessibilityRole="button"
                      key={
                        `${track.id}-${index}`
                      }
                      onPress={() => router.push({ pathname: "/song-context", params: { trackId: track.id, trackTitle: track.title, artistName: track.artist, artworkUrl: track.imageUrl ?? "", spotifyUrl: track.spotifyUrl ?? "", genreHints: item.scene.genres } } as never)}
                      style={
                        styles.trackRow
                      }
                    >
                      {track.imageUrl ? (
                        <Image source={track.imageUrl} contentFit="cover" style={styles.trackArtwork} />
                      ) : (
                        <Text style={styles.trackNumber}>{index + 1}</Text>
                      )}

                      <View
                        style={
                          styles.trackText
                        }
                      >
                        <Text
                          numberOfLines={
                            1
                          }
                          style={
                            styles.trackTitle
                          }
                        >
                          {track.title}
                        </Text>

                        <Text
                          numberOfLines={
                            1
                          }
                          style={
                            styles.trackArtist
                          }
                        >
                          {track.artist}
                        </Text>
                      </View>
                      <Ionicons color={canalDynamicColors.muted} name="chevron-forward" size={17} />
                    </Pressable>
                  ),
                )}
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Detail(
  props: {
    label: string;
    value?: string;
  },
) {
  if (!props.value) {
    return null;
  }

  return (
    <View
      style={
        styles.detailRow
      }
    >
      <Text
        style={
          styles.detailLabel
        }
      >
        {props.label}
      </Text>

      <Text
        style={
          styles.detailValue
        }
      >
        {props.value}
      </Text>
    </View>
  );
}

function PublicAction(props: { accessibilityHint?: string; accessibilityLabel?: string; busy?: boolean; disabled?: boolean; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }): React.JSX.Element {
  return <Pressable accessibilityHint={props.accessibilityHint} accessibilityLabel={props.accessibilityLabel ?? props.label} accessibilityRole="button" accessibilityState={{ busy: props.busy, disabled: props.disabled }} disabled={props.disabled} onPress={props.onPress} style={({ pressed }) => [styles.publicAction, props.disabled && styles.disabledButton, pressed && styles.publicActionPressed]}>{props.busy ? <ActivityIndicator color={canalDynamicColors.text} /> : <Ionicons color={canalDynamicColors.text} name={props.icon} size={20} />}<Text style={styles.publicActionText}>{props.label}</Text></Pressable>;
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: "transparent",
    },

    header: {
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 12,
    },

    backButton: {
      width: 48,
      height: 48,
      borderRadius: 21,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor: "transparent",
    },

    backText: {
      color: canalDynamicColors.text,
      fontSize: 34,
      lineHeight: 36,
    },

    headerTitle: {
      ...canalTypography.chrome,
      color: canalDynamicColors.text,
    },

    headerSpacer: {
      width: 42,
    },

    loading: {
      flex: 1,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    content: {
      paddingHorizontal: 20,
      paddingBottom: 45,
      gap: 14,
    },

    hero: {
      alignItems:
        "flex-start",
      backgroundColor: "rgba(255,255,255,.055)",
      borderRadius: 28,
      overflow: "hidden",
      padding: 20,
    },

    publicKicker: { color: canalDynamicColors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.4, marginBottom: 5 },

    artwork: {
      width: 92,
      height: 72,
      borderRadius: 20,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor: canalDynamicColors.warningSurface,
    },

    artworkText: {
      color: canalDynamicColors.gold,
      fontSize: 35,
      fontWeight: "900",
    },

    sceneName: {
      color: canalDynamicColors.text,
      fontSize: 24,
      fontWeight: "900",
      textAlign: "left",
      marginTop: 0,
    },

    sceneMeta: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      marginTop: 6,
    },

    creatorButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: "transparent",
      borderRadius: 13,
      paddingHorizontal: 13,
      paddingVertical: 9,
      marginTop: 13,
    },

    primaryActions: { alignSelf:"stretch", flexDirection:"row", gap:8, marginTop:16 },
    playSceneButton: { alignItems:"center", borderRadius:17, flex:1, flexDirection:"row", gap:8, justifyContent:"center", minHeight:52, paddingHorizontal:12 },
    playSceneText: { fontSize:14, fontWeight:"900" },
    reshootButton: { alignItems:"center", borderRadius:17, flex:1, flexDirection:"row", gap:8, justifyContent:"center", minHeight:52, paddingHorizontal:12 },
    reshootText: { fontSize:14, fontWeight:"900" },
    secondaryActions: { alignSelf:"stretch", flexDirection:"row", justifyContent:"space-around", marginTop:8 },
    publicAction: { alignItems:"center", gap:3, justifyContent:"center", minHeight:52, minWidth:72 },
    publicActionText: { color:canalDynamicColors.text, fontSize:10, fontWeight:"800" },
    publicActionPressed: { opacity:.58 },

    creatorText: {
      color: canalDynamicColors.gold,
      fontSize: 11,
      fontWeight: "900",
    },

    spotifyButton: {
      width: "100%",
      minHeight: 52,
      borderRadius: 17,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor: canalDynamicColors.mint,
      marginTop: 16,
    },

    spotifyButtonText: {
      color: "#07130B",
      fontSize: 14,
      fontWeight: "900",
    },

    saveButton: {
      width: "100%",
      minHeight: 50,
      borderWidth: 1,
      borderColor:
        "#F47A24",
      borderRadius: 17,
      alignItems:
        "center",
      justifyContent:
        "center",
      marginTop: 10,
    },

    saveButtonText: {
      color: canalDynamicColors.gold,
      fontSize: 13,
      fontWeight: "900",
    },

    shareButton: {
      width: "100%",
      minHeight: 50,
      borderRadius: 17,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      backgroundColor: "rgba(226, 255, 249, 0.08)",
      marginTop: 10,
    },

    shareBusy: {
      flexDirection: "row",
      alignItems:
        "center",
      gap: 8,
    },

    shareButtonText: {
      color: "#1B1B1B",
      fontSize: 13,
      fontWeight: "900",
    },

    disabledButton: {
      opacity: 0.45,
    },

    successBox: {
      backgroundColor: canalDynamicColors.successSurface,
      borderRadius: 16,
      padding: 14,
    },

    successText: {
      color: "#1D7138",
      fontSize: 12,
      lineHeight: 18,
    },

    openSpotifyButton: {
      minHeight: 48,
      alignSelf:
        "flex-start",
      borderRadius: 11,
      backgroundColor:
        "#1ED760",
      paddingHorizontal: 12,
      paddingVertical: 9,
      marginTop: 10,
    },

    openSpotifyText: {
      color: "#07130B",
      fontSize: 10,
      fontWeight: "900",
    },

    errorBox: {
      backgroundColor: canalDynamicColors.dangerSurface,
      borderRadius: 16,
      padding: 14,
    },

    errorText: {
      color: canalDynamicColors.danger,
      fontSize: 12,
      lineHeight: 18,
    },

    connectButton: {
      minHeight: 48,
      alignSelf:
        "flex-start",
      borderRadius: 11,
      backgroundColor: canalDynamicColors.surface,
      paddingHorizontal: 12,
      paddingVertical: 9,
      marginTop: 10,
    },

    connectText: {
      color: canalDynamicColors.danger,
      fontSize: 10,
      fontWeight: "900",
    },

    detailCard: {
      backgroundColor: "rgba(255,255,255,.045)",
      borderRadius: 22,
      padding: 16,
    },

    sectionTitle: {
      ...canalTypography.title,
      color: canalDynamicColors.text,
      fontSize: 22,
      lineHeight: 27,
      marginBottom: 8,
    },

    sectionDescription: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      lineHeight: 18,
      marginBottom: 12,
    },

    detailRow: {
      flexDirection: "row",
      alignItems:
        "flex-start",
      justifyContent:
        "space-between",
      borderTopWidth: 1,
      borderTopColor:
        canalDynamicColors.line,
      paddingVertical: 11,
    },

    detailLabel: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      fontWeight: "800",
    },

    detailValue: {
      maxWidth: "68%",
      color: canalDynamicColors.text,
      fontSize: 11,
      lineHeight: 17,
      textAlign: "right",
    },

    trackRow: {
      flexDirection: "row",
      alignItems:
        "center",
      borderTopWidth: 1,
      borderTopColor:
        canalDynamicColors.line,
      paddingVertical: 11,
    },

    trackNumber: {
      width: 29,
      color: "#A09993",
      fontSize: 11,
      fontWeight: "900",
    },

    trackText: {
      flex: 1,
    },

    trackArtwork: {
      width: 42,
      height: 42,
      borderRadius: 11,
      marginRight: 10,
    },

    trackTitle: {
      color: canalDynamicColors.text,
      fontSize: 13,
      fontWeight: "900",
    },

    trackArtist: {
      color: canalDynamicColors.muted,
      fontSize: 10,
      marginTop: 3,
    },
  });
