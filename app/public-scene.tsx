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
import { Image } from "expo-image";

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

import type {
  PublicCanalScene,
} from "../lib/social";

import {
  exportSceneToMusicProvider,
} from "../lib/scene-music-export";

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

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
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
  const shareInFlight =
    useRef(false);
  const load =
    useCallback(
      async (): Promise<void> => {
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

        try {
          const publicScene =
            await loadPublicScene(
              ownerId,
              sceneId,
            );

          setItem(
            publicScene,
          );

          setErrorMessage(
            "",
          );
        } catch (error) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Canal could not load this public Scene.",
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [
        ownerId,
        sceneId,
      ],
    );

  useEffect(() => {
    void load();
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

  const exportToSpotify =
    async (
      confirmedConnectivityStatus =
        connectivityStatus,
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
                "spotify",
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
            "Canal created the Spotify playlist but could not save its profile history:",
            historyError,
          );

          historyMessage =
            " The playlist was created, but its Canal history could not be saved.";
        }

        setMessage(
          `Exported ${result.exportedTrackCount} track${result.exportedTrackCount === 1 ? "" : "s"} to your Spotify. ${
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
              "Canal could not export this Scene to Spotify.",
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
          await exportToSpotify(
            nextStatus,
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

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Export Public Scene to Spotify"
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
                  style={[
                    styles.spotifyButton,

                    (
                      exporting ||
                      checkingConnection ||
                      connectivityStatus ===
                        "offline"
                    ) &&
                      styles.disabledButton,
                  ]}
                >
                  {exporting ||
                  checkingConnection ? (
                    <ActivityIndicator
                      color="#07130B"
                    />
                  ) : (
                    <Text
                      style={
                        styles.spotifyButtonText
                      }
                    >
                      Export to My Spotify
                    </Text>
                  )}
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Save Private Copy"
                  accessibilityState={{
                    busy: saving,
                    disabled:
                      item.isMine ||
                      item.savedByMe ||
                      saving,
                  }}
                  disabled={
                    item.isMine ||
                    item.savedByMe ||
                    saving
                  }
                  onPress={() =>
                    void save()
                  }
                  style={[
                    styles.saveButton,

                    (
                      item.isMine ||
                      item.savedByMe
                    ) &&
                      styles.disabledButton,
                  ]}
                >
                  {saving ? (
                    <ActivityIndicator
                      color="#F47A24"
                    />
                  ) : (
                    <Text
                      style={
                        styles.saveButtonText
                      }
                    >
                      {item.isMine
                        ? "This Scene Is Yours"
                        : item.savedByMe
                          ? "Saved to Library"
                          : "Save Private Copy"}
                    </Text>
                  )}
                </Pressable>

                <Pressable
                  accessibilityHint="Opens your device sharing options."
                  accessibilityLabel={`Share ${item.scene.name}`}
                  accessibilityRole="button"
                  accessibilityState={{
                    busy:
                      sharing,
                    disabled:
                      sharing,
                  }}
                  disabled={
                    sharing
                  }
                  onPress={() =>
                    void share()
                  }
                  style={[
                    styles.shareButton,

                    sharing &&
                      styles.disabledButton,
                  ]}
                >
                  {sharing ? (
                    <View
                      style={
                        styles.shareBusy
                      }
                    >
                      <ActivityIndicator
                        color="#1B1B1B"
                      />

                      <Text
                        style={
                          styles.shareButtonText
                        }
                      >
                        Sharing…
                      </Text>
                    </View>
                  ) : (
                    <Text
                      style={
                        styles.shareButtonText
                      }
                    >
                      Share Public Scene
                    </Text>
                  )}
                </Pressable>
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
                    <View
                      key={
                        `${track.id}-${index}`
                      }
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
                    </View>
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
      backgroundColor:
        "#FFFFFF",
    },

    backText: {
      color: "#1B1B1B",
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
        "center",
      backgroundColor:
        "#FFFFFF",
      borderRadius: 24,
      padding: 22,
    },

    artwork: {
      width: 92,
      height: 72,
      borderRadius: 20,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#FFF0E5",
    },

    artworkText: {
      color: "#F47A24",
      fontSize: 35,
      fontWeight: "900",
    },

    sceneName: {
      color: "#1B1B1B",
      fontSize: 24,
      fontWeight: "900",
      textAlign: "center",
      marginTop: 0,
    },

    sceneMeta: {
      color: "#746D67",
      fontSize: 12,
      marginTop: 6,
    },

    creatorButton: {
      backgroundColor:
        "#FFF9F4",
      borderRadius: 13,
      paddingHorizontal: 13,
      paddingVertical: 9,
      marginTop: 13,
    },

    creatorText: {
      color: "#F47A24",
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
      color: "#F47A24",
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
      backgroundColor:
        "#EAF9EF",
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
      backgroundColor:
        "#FFF0EF",
      borderRadius: 16,
      padding: 14,
    },

    errorText: {
      color: "#A62E27",
      fontSize: 12,
      lineHeight: 18,
    },

    connectButton: {
      minHeight: 48,
      alignSelf:
        "flex-start",
      borderRadius: 11,
      backgroundColor:
        "#FFFFFF",
      paddingHorizontal: 12,
      paddingVertical: 9,
      marginTop: 10,
    },

    connectText: {
      color: "#A62E27",
      fontSize: 10,
      fontWeight: "900",
    },

    detailCard: {
      backgroundColor:
        "#FFFFFF",
      borderRadius: 22,
      padding: 18,
    },

    sectionTitle: {
      ...canalTypography.title,
      color: canalDynamicColors.text,
      fontSize: 22,
      lineHeight: 27,
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
        canalDynamicColors.line,
      paddingVertical: 11,
    },

    detailLabel: {
      color: "#817972",
      fontSize: 11,
      fontWeight: "800",
    },

    detailValue: {
      maxWidth: "68%",
      color: "#322E2B",
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
      color: "#282421",
      fontSize: 13,
      fontWeight: "900",
    },

    trackArtist: {
      color: canalDynamicColors.muted,
      fontSize: 10,
      marginTop: 3,
    },
  });
import { canalDynamicColors } from "../theme/canal-dynamic-colors";
