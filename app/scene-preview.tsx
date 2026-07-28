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
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  router,
} from "expo-router";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  RecoveryNotice,
} from "../components/recovery-notice";

import {
  classifyRecoveryIssue,
} from "../lib/recovery-issue";

import {
  readGeneratedScenePreview,
  saveGeneratedSceneToLibrary,
  writeGeneratedScenePreview,
} from "../lib/scene-studio";

import type {
  GeneratedSceneResult,
} from "../lib/scene-studio";

import {
  addSpotifyTrackToGeneratedScene,
  removeTrackFromGeneratedSceneEditor,
} from "../lib/scene-preview-editor";

import {
  exportSceneToSpotify,
  getSpotifyLibraryTrackSuggestions,
  searchSpotifySceneTracks,
} from "../lib/spotify-scene-tools";

import {
  classifyAnalyticsFailure,
  recordAnalyticsEvent,
  recordAnalyticsFailure,
} from "../lib/analytics";

import {
  createPlayerSession,
} from "../lib/canal-player";

import type {
  SpotifySceneSearchTrack,
} from "../lib/spotify-scene-tools";

import {
  readSpotifyLibrarySnapshot,
} from "../lib/spotify-library";

import type {
  SpotifyLibrarySnapshot,
} from "../lib/spotify-library";

import {
  useConnectivity,
} from "../providers/connectivity-provider";

function safeBack(): void {
  if (
    router.canGoBack()
  ) {
    router.back();

    return;
  }

  router.replace(
    "/scene-studio" as never,
  );
}

function artistNames(
  track: SpotifySceneSearchTrack,
): string {
  return track.artists
    .map(
      (artist) =>
        artist.name,
    )
    .filter(
      Boolean,
    )
    .join(
      ", ",
    );
}

function durationText(
  durationMs?: number,
): string {
  const totalSeconds =
    Math.round(
      (
        durationMs ??
        210_000
      ) /
        1000,
    );

  const minutes =
    Math.floor(
      totalSeconds /
        60,
    );

  const seconds =
    totalSeconds %
    60;

  return `${minutes}:${seconds
    .toString()
    .padStart(
      2,
      "0",
    )}`;
}

export default function ScenePreviewScreen() {
  const {
    refresh:
      refreshConnectivity,
    status:
      connectivityStatus,
  } =
    useConnectivity();

  const [
    result,
    setResult,
  ] =
    useState<
      GeneratedSceneResult | null
    >(
      null,
    );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    query,
    setQuery,
  ] = useState("");

  const [
    searchResults,
    setSearchResults,
  ] =
    useState<
      SpotifySceneSearchTrack[]
    >([]);

  const [
    librarySnapshot,
    setLibrarySnapshot,
  ] =
    useState<SpotifyLibrarySnapshot | null>(
      null,
    );

  const [
    searching,
    setSearching,
  ] = useState(false);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    exporting,
    setExporting,
  ] = useState(false);

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

  const [
    exportErrorCause,
    setExportErrorCause,
  ] =
    useState<unknown>(
      null,
    );

  const searchRequestId =
    useRef(0);

  const exportInFlight =
    useRef(false);

  const load =
    useCallback(
      async (): Promise<void> => {
        setLoading(
          true,
        );

        try {
          const [
            stored,
            storedLibrary,
          ] =
            await Promise.all([
              readGeneratedScenePreview(),
              readSpotifyLibrarySnapshot(),
            ]);

          if (!stored) {
            throw new Error(
              "No generated Scene was found.",
            );
          }

          setResult(
            stored,
          );

          setLibrarySnapshot(
            storedLibrary,
          );
        } catch (error) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Canal could not open the generated Scene.",
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [],
    );

  useEffect(() => {
    void load();
  }, [
    load,
  ]);

  const includedIds =
    useMemo(
      () =>
        new Set(
          result?.trackSignals.map(
            (signal) =>
              signal.track.id,
          ) ??
            [],
        ),
      [
        result,
      ],
    );

  const localSuggestions =
    useMemo(
      () =>
        getSpotifyLibraryTrackSuggestions(
          librarySnapshot,
          query,
        ),
      [
        librarySnapshot,
        query,
      ],
    );

  useEffect(() => {
    setExportErrorCause(
      null,
    );

    const cleanedQuery =
      query.trim();

    const requestId =
      searchRequestId.current +
      1;

    searchRequestId.current =
      requestId;

    if (!cleanedQuery) {
      setSearchResults([]);
      setSearching(false);

      return;
    }

    setSearchResults(
      localSuggestions,
    );

    if (
      localSuggestions.length >
      0
    ) {
      setSearching(false);

      return;
    }

    if (
      cleanedQuery.length <
      3
    ) {
      setSearching(false);

      return;
    }

    setSearching(true);

    const timer =
      setTimeout(() => {
        const search =
          async (): Promise<void> => {
            try {
              const liveResults =
                await searchSpotifySceneTracks(
                  cleanedQuery,
                );

              if (
                searchRequestId.current !==
                requestId
              ) {
                return;
              }

              const merged =
                new Map<
                  string,
                  SpotifySceneSearchTrack
                >();

              for (
                const track of [
                  ...localSuggestions,
                  ...liveResults,
                ]
              ) {
                if (
                  !merged.has(
                    track.id,
                  )
                ) {
                  merged.set(
                    track.id,
                    track,
                  );
                }
              }

              setSearchResults(
                Array.from(
                  merged.values(),
                ).slice(0, 10),
              );

              setErrorMessage("");
            } catch (error) {
              if (
                searchRequestId.current !==
                  requestId ||
                localSuggestions.length >
                  0
              ) {
                return;
              }

              setErrorMessage(
                error instanceof Error
                  ? error.message
                  : "Canal could not search Spotify.",
              );
            } finally {
              if (
                searchRequestId.current ===
                requestId
              ) {
                setSearching(false);
              }
            }
          };

        void search();
      }, 600);

    return () => {
      clearTimeout(timer);
    };
  }, [
    localSuggestions,
    query,
  ]);

  const persistResult =
    async (
      next: GeneratedSceneResult,
    ): Promise<void> => {
      await writeGeneratedScenePreview(
        next,
      );

      setResult(
        next,
      );
    };

  const addTrack =
    async (
      track: SpotifySceneSearchTrack,
    ): Promise<void> => {
      if (!result) {
        return;
      }

      setExportErrorCause(
        null,
      );

      try {
        const next =
          addSpotifyTrackToGeneratedScene(
            result,
            track,
          );

        await persistResult(
          next,
        );

        setMessage(
          `"${track.name}" was added to the Scene.`,
        );

        setErrorMessage("");
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not add this track.",
        );
      }
    };

  const removeTrack =
    async (
      trackId: string,
    ): Promise<void> => {
      if (!result) {
        return;
      }

      setExportErrorCause(
        null,
      );

      try {
        const next =
          removeTrackFromGeneratedSceneEditor(
            result,
            trackId,
          );

        await persistResult(
          next,
        );

        setMessage(
          "Track removed from the Scene.",
        );

        setErrorMessage("");
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not remove this track.",
        );
      }
    };

  const save =
    async (): Promise<void> => {
      if (
        !result ||
        saving
      ) {
        return;
      }

      setSaving(
        true,
      );

      setMessage("");
      setErrorMessage("");
      setExportErrorCause(
        null,
      );

      try {
        await writeGeneratedScenePreview(
          result,
        );

        const savedScene =
          await saveGeneratedSceneToLibrary(
            result,
          );

        await createPlayerSession(
          savedScene,
        );

        router.replace({
          pathname:
            "/now-playing",

          params: {
            sceneId:
              savedScene.id,
          },
        });
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not save this Scene.",
        );
      } finally {
        setSaving(
          false,
        );
      }
    };

  const exportToSpotify =
    async (
      refreshBeforeExport = false,
      attempt:
        | "initial"
        | "retry" =
          "initial",
    ): Promise<void> => {
      if (
        !result ||
        exportInFlight.current
      ) {
        return;
      }

      exportInFlight.current =
        true;

      setExporting(
        true,
      );

      try {
        if (
          refreshBeforeExport
        ) {
          const nextStatus =
            await refreshConnectivity();

          if (
            nextStatus ===
            "offline"
          ) {
            return;
          }
        }

        setMessage("");
        setErrorMessage("");
        setExportErrorCause(
          null,
        );
        setPlaylistUrl(
          null,
        );

        const exportResult =
          await exportSceneToSpotify(
            result.scene,
          );

        void recordAnalyticsEvent({
          name:
            "scene_export_completed",
          attempt,
        });

        setPlaylistUrl(
          exportResult
            .playlistUrl,
        );

        setMessage(
          `Exported ${exportResult.trackCount} track${exportResult.trackCount === 1 ? "" : "s"} to your Spotify. ${
            exportResult.skippedCount > 0
              ? `${exportResult.skippedCount} unmatched track${exportResult.skippedCount === 1 ? " was" : "s were"} skipped.`
              : ""
          }`,
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
          attempt,
        );

        setExportErrorCause(
          () => error,
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Canal could not export this Scene to Spotify.",
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
      () =>
        exportErrorCause
          ? classifyRecoveryIssue(
              exportErrorCause,
              {
                service:
                  "spotify",
                connectivityStatus,
              },
            )
          : null,
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
          "/music-services" as never,
        );

        return;
      }

      await exportToSpotify(
        true,
        "retry",
      );
    };

  if (loading) {
    return (
      <SafeAreaView
        style={
          styles.safeArea
        }
      >
        <View
          style={
            styles.loading
          }
        >
          <ActivityIndicator
            size="large"
          />
        </View>
      </SafeAreaView>
    );
  }

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
          Edit Scene
        </Text>

        <View
          style={
            styles.headerSpacer
          }
        />
      </View>

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={
          false
        }
      >
        {result ? (
          <>
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
                GENERATED SCENE
              </Text>

              <Text
                style={
                  styles.sceneName
                }
              >
                {result.scene.name}
              </Text>

              <Text
                style={
                  styles.sceneMeta
                }
              >
                {result.scene.activity}{" "}
                ·{" "}
                {result.estimatedDurationMinutes}{" "}
                min ·{" "}
                {result.trackSignals.length}{" "}
                tracks
              </Text>
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
                  exporting
                }
                issue={
                  exportRecoveryIssue
                }
                onAction={
                  recoverExport
                }
              />
            ) : errorMessage ? (
              <View
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

                {errorMessage.includes(
                  "connect",
                ) ||
                errorMessage.includes(
                  "authorization",
                ) ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      router.push(
                        "/music-services" as never,
                      )
                    }
                    style={
                      styles.musicServicesButton
                    }
                  >
                    <Text
                      style={
                        styles.musicServicesText
                      }
                    >
                      Open Music Services
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <View
              style={
                styles.searchCard
              }
            >
              <Text
                style={
                  styles.sectionTitle
                }
              >
                Add real songs
              </Text>

              <Text
                style={
                  styles.sectionSubtitle
                }
              >
                Suggestions update as you type. Recent and liked music appears first, then Canal adds live Spotify matches.
              </Text>

              <View
                style={
                  styles.searchRow
                }
              >
                <TextInput
                  value={
                    query
                  }
                  onChangeText={
                    setQuery
                  }
                  placeholder="Type a song or artist"
                  placeholderTextColor="#9A938C"
                  returnKeyType="search"
                  style={
                    styles.searchInput
                  }
                />

                {searching ? (
                  <ActivityIndicator
                    accessibilityLabel="Searching Spotify"
                    size="small"
                    color="#F47A24"
                  />
                ) : null}
              </View>

              {searchResults.length >
              0 ? (
                <View
                  style={
                    styles.searchResults
                  }
                >
                  {searchResults.map(
                    (track) => {
                      const included =
                        includedIds.has(
                          track.id,
                        );

                      return (
                        <View
                          key={
                            track.id
                          }
                          style={
                            styles.searchResult
                          }
                        >
                          <View
                            style={[
                              styles.trackImage,
                              styles.placeholderImage,
                            ]}
                          >
                            <Text
                              style={
                                styles.placeholderText
                              }
                            >
                              ♪
                            </Text>
                          </View>

                          <View
                            style={
                              styles.resultText
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
                              {track.name}
                            </Text>

                            <Text
                              numberOfLines={
                                1
                              }
                              style={
                                styles.trackArtist
                              }
                            >
                              {artistNames(
                                track,
                              )}{" "}
                              ·{" "}
                              {durationText(
                                track.duration_ms,
                              )}
                            </Text>
                          </View>

                          <Pressable
                            accessibilityRole="button"
                            disabled={
                              included
                            }
                            onPress={() =>
                              void addTrack(
                                track,
                              )
                            }
                            style={[
                              styles.addButton,

                              included &&
                                styles.includedButton,
                            ]}
                          >
                            <Text
                              style={[
                                styles.addText,

                                included &&
                                  styles.includedText,
                              ]}
                            >
                              {included
                                ? "Added"
                                : "Add"}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    },
                  )}
                </View>
              ) : query.trim() &&
                !searching ? (
                <Text
                  style={
                    styles.noSearchResults
                  }
                >
                  No matching songs or artists yet.
                </Text>
              ) : null}
            </View>

            <View
              style={
                styles.trackCard
              }
            >
              <View
                style={
                  styles.trackHeader
                }
              >
                <View>
                  <Text
                    style={
                      styles.sectionTitle
                    }
                  >
                    Current mix
                  </Text>

                  <Text
                    style={
                      styles.sectionSubtitle
                    }
                  >
                    Remove any track before saving or exporting.
                  </Text>
                </View>

                <Text
                  style={
                    styles.trackCount
                  }
                >
                  {result.trackSignals.length}
                </Text>
              </View>

              {result.trackSignals.map(
                (
                  signal,
                  index,
                ) => {
                  return (
                    <View
                      key={
                        `${signal.track.id}-${index}`
                      }
                      style={
                        styles.currentTrack
                      }
                    >
                      <View
                        style={[
                          styles.trackImage,
                          styles.placeholderImage,
                        ]}
                      >
                        <Text
                          style={
                            styles.placeholderText
                          }
                        >
                          ♪
                        </Text>
                      </View>

                      <View
                        style={
                          styles.resultText
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
                          {signal.track.name}
                        </Text>

                        <Text
                          numberOfLines={
                            1
                          }
                          style={
                            styles.trackArtist
                          }
                        >
                          {signal.track
                            .artists
                            .map(
                              (artist) =>
                                artist.name,
                            )
                            .join(
                              ", ",
                            )}{" "}
                          ·{" "}
                          {durationText(
                            signal.track
                              .duration_ms,
                          )}
                        </Text>
                      </View>

                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          void removeTrack(
                            signal.track.id,
                          )
                        }
                        style={
                          styles.removeButton
                        }
                      >
                        <Text
                          style={
                            styles.removeText
                          }
                        >
                          Remove
                        </Text>
                      </Pressable>
                    </View>
                  );
                },
              )}
            </View>

            <View
              style={
                styles.actions
              }
            >
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.replace({
                    pathname:
                      "/scene-studio",

                    params: {
                      resume:
                        "1",

                      mode:
                        "edit",
                    },
                  } as never)
                }
                style={
                  styles.secondaryButton
                }
              >
                <Text
                  style={
                    styles.secondaryText
                  }
                >
                  Edit Mood and Activity
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={
                  saving
                }
                onPress={() =>
                  void save()
                }
                style={
                  styles.primaryButton
                }
              >
                {saving ? (
                  <ActivityIndicator
                    color="#FFFFFF"
                  />
                ) : (
                  <Text
                    style={
                      styles.primaryText
                    }
                  >
                    Save & Play Scene
                  </Text>
                )}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={
                  exporting
                }
                onPress={() =>
                  void exportToSpotify()
                }
                style={
                  styles.spotifyButton
                }
              >
                {exporting ? (
                  <ActivityIndicator
                    color="#07130B"
                  />
                ) : (
                  <Text
                    style={
                      styles.spotifyText
                    }
                  >
                    Export Final Mix to Spotify
                  </Text>
                )}
              </Pressable>
            </View>
          </>
        ) : (
          <View
            style={
              styles.errorBox
            }
          >
            <Text
              style={
                styles.errorText
              }
            >
              {errorMessage ||
                "No generated Scene was found."}
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.replace(
                  "/scene-studio" as never,
                )
              }
              style={
                styles.musicServicesButton
              }
            >
              <Text
                style={
                  styles.musicServicesText
                }
              >
                Open Scene Studio
              </Text>
            </Pressable>
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
        "#FFF9F4",
    },

    loading: {
      flex: 1,
      alignItems:
        "center",
      justifyContent:
        "center",
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
    },

    headerTitle: {
      color: "#1B1B1B",
      fontSize: 16,
      fontWeight: "900",
    },

    headerSpacer: {
      width: 42,
    },

    content: {
      paddingHorizontal: 20,
      paddingBottom: 45,
      gap: 14,
    },

    hero: {
      backgroundColor:
        "#FFFFFF",
      borderRadius: 22,
      padding: 19,
    },

    eyebrow: {
      color: "#F47A24",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.8,
    },

    sceneName: {
      color: "#1B1B1B",
      fontSize: 24,
      fontWeight: "900",
      marginTop: 7,
    },

    sceneMeta: {
      color: "#746D67",
      fontSize: 12,
      marginTop: 6,
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

    openSpotifyButton: {
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

    musicServicesButton: {
      alignSelf:
        "flex-start",
      borderRadius: 11,
      backgroundColor:
        "#FFFFFF",
      paddingHorizontal: 12,
      paddingVertical: 9,
      marginTop: 10,
    },

    musicServicesText: {
      color: "#A62E27",
      fontSize: 10,
      fontWeight: "900",
    },

    searchCard: {
      backgroundColor:
        "#FFFFFF",
      borderRadius: 22,
      padding: 17,
    },

    sectionTitle: {
      color: "#1B1B1B",
      fontSize: 18,
      fontWeight: "900",
    },

    sectionSubtitle: {
      color: "#817972",
      fontSize: 11,
      lineHeight: 17,
      marginTop: 4,
    },

    searchRow: {
      flexDirection: "row",
      gap: 9,
      marginTop: 13,
    },

    searchInput: {
      flex: 1,
      minHeight: 48,
      borderWidth: 1,
      borderColor:
        "#E2DAD4",
      borderRadius: 14,
      color: "#1B1B1B",
      paddingHorizontal: 13,
    },

    searchButton: {
      minWidth: 76,
      borderRadius: 14,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F47A24",
    },

    searchButtonText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "900",
    },

    searchResults: {
      marginTop: 10,
    },

    noSearchResults: {
      color: "#817972",
      fontSize: 12,
      lineHeight: 18,
      marginTop: 12,
    },

    searchResult: {
      flexDirection: "row",
      alignItems:
        "center",
      borderTopWidth: 1,
      borderTopColor:
        "#F0ECE8",
      paddingVertical: 10,
    },

    trackImage: {
      width: 47,
      height: 47,
      borderRadius: 10,
      marginRight: 10,
    },

    placeholderImage: {
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F0ECE8",
    },

    placeholderText: {
      color: "#918981",
      fontSize: 18,
    },

    resultText: {
      flex: 1,
    },

    trackTitle: {
      color: "#292522",
      fontSize: 12,
      fontWeight: "900",
    },

    trackArtist: {
      color: "#817972",
      fontSize: 10,
      marginTop: 4,
    },

    addButton: {
      minWidth: 54,
      minHeight: 35,
      borderRadius: 11,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F47A24",
      marginLeft: 8,
    },

    includedButton: {
      backgroundColor:
        "#ECE7E3",
    },

    addText: {
      color: "#FFFFFF",
      fontSize: 10,
      fontWeight: "900",
    },

    includedText: {
      color: "#837B74",
    },

    trackCard: {
      backgroundColor:
        "#FFFFFF",
      borderRadius: 22,
      padding: 17,
    },

    trackHeader: {
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      marginBottom: 8,
    },

    trackCount: {
      color: "#F47A24",
      fontSize: 14,
      fontWeight: "900",
    },

    currentTrack: {
      flexDirection: "row",
      alignItems:
        "center",
      borderTopWidth: 1,
      borderTopColor:
        "#F0ECE8",
      paddingVertical: 10,
    },

    removeButton: {
      borderWidth: 1,
      borderColor:
        "#E4B8B4",
      borderRadius: 10,
      paddingHorizontal: 9,
      paddingVertical: 8,
      marginLeft: 7,
    },

    removeText: {
      color: "#A62E27",
      fontSize: 9,
      fontWeight: "900",
    },

    actions: {
      gap: 10,
    },

    secondaryButton: {
      minHeight: 50,
      borderWidth: 1,
      borderColor:
        "#DAD2CC",
      borderRadius: 16,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#FFFFFF",
    },

    secondaryText: {
      color: "#625B55",
      fontSize: 13,
      fontWeight: "900",
    },

    primaryButton: {
      minHeight: 53,
      borderRadius: 17,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F47A24",
    },

    primaryText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "900",
    },

    spotifyButton: {
      minHeight: 53,
      borderRadius: 17,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#1ED760",
    },

    spotifyText: {
      color: "#07130B",
      fontSize: 14,
      fontWeight: "900",
    },
  });
