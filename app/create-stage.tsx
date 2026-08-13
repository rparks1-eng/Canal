import { canalDynamicColors } from "../theme/canal-dynamic-colors";
import * as Haptics from "expo-haptics";
import {
  Stack,
  router,
  useLocalSearchParams,
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
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  RecoveryNotice,
} from "../components/recovery-notice";
import {
  useReconnectReload,
} from "../hooks/use-reconnect-reload";
import {
  createLiveStage,
} from "../lib/live-stages";
import type {
  LiveStageTrack,
  LiveStageVisibility,
} from "../lib/live-stages";
import {
  readScenes,
} from "../lib/scenes";
import type {
  StoredScene,
} from "../lib/scenes";
import {
  submitSceneToStage,
} from "../lib/stage-collaboration";
import {
  generateCreativeStageName,
} from "../lib/creative-names";
import {
  classifyRecoveryIssue,
} from "../lib/recovery-issue";
import {
  useAuth,
} from "../providers/auth-provider";
import {
  useConnectivity,
} from "../providers/connectivity-provider";

function firstParam(
  value:
    | string
    | string[]
    | undefined,
): string {
  return Array.isArray(
    value,
  )
    ? value[0] ?? ""
    : value ?? "";
}

function sceneTracks(
  scene: StoredScene,
): LiveStageTrack[] {
  return scene.tracks.map(
    (track) => ({
      id: track.id,
      title: track.title,
      artist: track.artist,
      source:
        track.source ??
        "Spotify",
      spotifyUri:
        track.spotifyUri,
      spotifyUrl:
        track.spotifyUrl,
      providerId:
        track.providerId,
      providerTrackId:
        track.providerTrackId,
      providerUrl:
        track.providerUrl,
      genreEvidence:
        track.genreEvidence,
      durationMs:
        track.durationMs,
      explicit:
        track.explicit,
      imageUrl:
        track.imageUrl,
    }),
  );
}

export default function CreateStageScreen() {
  const params =
    useLocalSearchParams<{
      sceneId?:
        | string
        | string[];
    }>();

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

  const requestedSceneId =
    firstParam(
      params.sceneId,
    );

  const accountKey =
    user?.id ??
    (
      configured
        ? "configured:signed-out"
        : `local:${profile?.createdAt ?? "default"}:${profile?.handle ?? ""}`
    );

  const sceneLoadKey = [
    accountKey,
    requestedSceneId,
  ].join(
    "\u0000",
  );

  const [
    scenes,
    setScenes,
  ] = useState<
    StoredScene[]
  >([]);

  const [
    scenesAccountKey,
    setScenesAccountKey,
  ] = useState(
    accountKey,
  );

  const [
    selectedSceneId,
    setSelectedSceneId,
  ] = useState(
    requestedSceneId,
  );

  const [
    name,
    setName,
  ] = useState("");

  const [
    activity,
    setActivity,
  ] = useState("");

  const [
    visibility,
    setVisibility,
  ] =
    useState<LiveStageVisibility>(
      "public",
    );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    creating,
    setCreating,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    sceneLoadError,
    setSceneLoadError,
  ] = useState("");

  const accountKeyRef =
    useRef(
      accountKey,
    );

  const sceneLoadKeyRef =
    useRef(
      sceneLoadKey,
    );

  const sceneRequestIdRef =
    useRef(0);

  const creatingRef =
    useRef(false);

  const createOperationIdRef =
    useRef(0);

  accountKeyRef.current =
    accountKey;

  sceneLoadKeyRef.current =
    sceneLoadKey;

  const loadScenes =
    useCallback(
      async (): Promise<void> => {
        const requestId =
          sceneRequestIdRef
            .current +
          1;

        sceneRequestIdRef.current =
          requestId;

        const requestedAccountKey =
          accountKey;

        const requestedSceneLoadKey =
          sceneLoadKey;

        setLoading(
          true,
        );

        try {
          const storedScenes =
            await readScenes();

          if (
            requestId !==
              sceneRequestIdRef
                .current ||
            requestedAccountKey !==
              accountKeyRef.current ||
            requestedSceneLoadKey !==
              sceneLoadKeyRef.current
          ) {
            return;
          }

          const ownedScenes =
            storedScenes.filter(
              (scene) =>
                scene.libraryType !==
                "saved",
            );

          setScenes(
            ownedScenes,
          );
          setScenesAccountKey(
            requestedAccountKey,
          );
          setSceneLoadError(
            "",
          );

          const initialScene =
            ownedScenes.find(
              (scene) =>
                scene.id ===
                requestedSceneId,
            ) ??
            ownedScenes[0];

          if (initialScene) {
            setSelectedSceneId(
              initialScene.id,
            );
            setName(
              `${initialScene.name} Live`.slice(
                0,
                80,
              ),
            );
            setActivity(
              initialScene.activity,
            );
            setVisibility(
              initialScene.visibility ===
              "public"
                ? "public"
                : "private",
            );
          } else {
            setSelectedSceneId(
              "",
            );
          }
        } catch (
          loadError
        ) {
          if (
            requestId !==
              sceneRequestIdRef
                .current ||
            requestedAccountKey !==
              accountKeyRef.current ||
            requestedSceneLoadKey !==
              sceneLoadKeyRef.current
          ) {
            return;
          }

          setSceneLoadError(
            loadError instanceof
              Error
              ? loadError.message
              : "Canal could not load your Scenes.",
          );
        } finally {
          if (
            requestId !==
              sceneRequestIdRef
                .current ||
            requestedAccountKey !==
              accountKeyRef.current ||
            requestedSceneLoadKey !==
              sceneLoadKeyRef.current
          ) {
            return;
          }

          setLoading(
            false,
          );
        }
      },
      [
        accountKey,
        requestedSceneId,
        sceneLoadKey,
      ],
    );

  useEffect(() => {
    void loadScenes();

    return () => {
      sceneRequestIdRef
        .current +=
        1;
    };
  }, [
    loadScenes,
  ]);

  useEffect(() => {
    createOperationIdRef
      .current +=
      1;
    creatingRef.current =
      false;
    setCreating(
      false,
    );
    setError("");
  }, [
    sceneLoadKey,
  ]);

  useReconnectReload(
    loadScenes,
  );

  const visibleScenes =
    useMemo(
      () =>
        scenesAccountKey ===
        accountKey
          ? scenes
          : [],
      [
        accountKey,
        scenes,
        scenesAccountKey,
      ],
    );

  const selectedScene =
    useMemo(
      () =>
        visibleScenes.find(
          (scene) =>
            scene.id ===
            selectedSceneId,
        ) ?? null,
      [
        visibleScenes,
        selectedSceneId,
      ],
    );

  const sceneRecoveryIssue =
    useMemo(
      () => {
        if (sceneLoadError) {
          return classifyRecoveryIssue(
            sceneLoadError,
            {
              service:
                "canal",
              connectivityStatus,
            },
          );
        }

        if (
          connectivityStatus ===
            "offline" &&
          configured
        ) {
          return classifyRecoveryIssue(
            new Error(
              "Canal is offline.",
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
        sceneLoadError,
      ],
    );

  const recoverScenes =
    useCallback(
      async (): Promise<void> => {
        if (
          sceneRecoveryIssue
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
          await loadScenes();
        }
      },
      [
        loadScenes,
        refreshConnectivity,
        sceneRecoveryIssue,
      ],
    );

  const createDisabled =
    creating ||
    (
      configured &&
      connectivityStatus ===
        "offline"
    );

  function chooseScene(
    scene: StoredScene,
  ) {
    setSelectedSceneId(
      scene.id,
    );
    setName(
      generateCreativeStageName(
        {
          sceneName: scene.name,
          activity: scene.activity,
          moods: scene.emotions.split(",").map((mood) => mood.trim()).filter(Boolean),
          genres: scene.genres.split(",").map((genre) => genre.trim()).filter(Boolean),
        },
        {
          seed: `${scene.id}:${Date.now()}`,
          existingNames: visibleScenes.map((item) => item.name),
        },
      ).slice(0, 80),
    );
    setActivity(
      scene.activity,
    );
    setVisibility(
      scene.visibility ===
      "public"
        ? "public"
        : "private",
    );
    setError("");

    if (
      process.env.EXPO_OS ===
      "ios"
    ) {
      void Haptics
        .selectionAsync();
    }
  }

  async function startStage() {
    if (
      creatingRef.current
    ) {
      return;
    }

    if (!selectedScene) {
      setError(
        "Choose a Scene before starting a Stage.",
      );
      return;
    }

    if (!name.trim()) {
      setError(
        "Give your Stage a name.",
      );
      return;
    }

    if (
      configured &&
      connectivityStatus ===
        "offline"
    ) {
      setError(
        "Reconnect before starting this Stage.",
      );
      return;
    }

    creatingRef.current =
      true;

    const operationId =
      createOperationIdRef
        .current +
      1;

    createOperationIdRef.current =
      operationId;

    const operationAccountKey =
      accountKey;

    const operationSceneLoadKey =
      sceneLoadKey;

    try {
      setCreating(
        true,
      );
      setError("");

      const stage =
        await createLiveStage({
          // Scene Studio currently stores generated Scenes locally. Passing
          // that local identifier as a cloud foreign key makes Supabase RLS
          // correctly reject the Stage insert. The Stage already carries its
          // own bounded queue snapshot, so leave the optional cloud Scene
          // reference unset until the selected Scene has cloud provenance.
          name:
            name.trim(),
          activity:
            activity.trim() ||
            selectedScene.activity,
          visibility,
          tracks:
            sceneTracks(
              selectedScene,
            ),
          hostName:
            profile?.displayName,
          hostUsername:
            profile?.handle,
        });

      await submitSceneToStage(
        stage.id,
        selectedScene,
      );

      if (
        operationId !==
          createOperationIdRef
            .current ||
        operationAccountKey !==
          accountKeyRef.current ||
        operationSceneLoadKey !==
          sceneLoadKeyRef.current
      ) {
        return;
      }

      if (
        process.env
          .EXPO_OS ===
        "ios"
      ) {
        void Haptics
          .notificationAsync(
            Haptics
              .NotificationFeedbackType
              .Success,
          );
      }

      router.replace({
        pathname:
          "/stage-invite-collaborators",
        params: {
          stageId:
            stage.id,
        },
      });
    } catch (
      createError
    ) {
      if (
        operationId !==
          createOperationIdRef
            .current ||
        operationAccountKey !==
          accountKeyRef.current ||
        operationSceneLoadKey !==
          sceneLoadKeyRef.current
      ) {
        return;
      }

      setError(
        createError instanceof
          Error
          ? createError.message
          : "Canal could not start this Stage.",
      );

      if (
        process.env
          .EXPO_OS ===
        "ios"
      ) {
        void Haptics
          .notificationAsync(
            Haptics
              .NotificationFeedbackType
              .Error,
          );
      }
    } finally {
      if (
        operationId !==
          createOperationIdRef
            .current
      ) {
        return;
      }

      creatingRef.current =
        false;
      setCreating(
        false,
      );
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown:
            true,
          title:
            "Start a Stage",
          headerBackTitle:
            "Create",
          headerShadowVisible:
            false,
          headerStyle: {
            backgroundColor: canalDynamicColors.surface,
          },
          headerTintColor:
            "#2B211B",
        }}
      />

      <KeyboardAvoidingView
        behavior={
          process.env
            .EXPO_OS ===
          "ios"
            ? "padding"
            : undefined
        }
        style={styles.screen}
      >
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={
            styles.content
          }
        >
          <View
            style={
              styles.hero
            }
          >
            <View
              style={
                styles.liveMark
              }
            >
              <View
                style={
                  styles.liveDot
                }
              />

              <Text
                style={
                  styles.liveMarkText
                }
              >
                CREATE LIVE
              </Text>
            </View>

            <Text
              selectable
              style={
                styles.heading
              }
            >
              Turn a Scene into a
              shared room.
            </Text>

            <Text
              selectable
              style={
                styles.intro
              }
            >
              Your queue becomes the
              Stage. Track changes,
              members, and chat update
              for everyone in realtime.
            </Text>
          </View>

          {loading &&
          visibleScenes.length ===
            0 ? (
            <View
              style={
                styles.loading
              }
            >
              <ActivityIndicator
                size="large"
                color="#F47A24"
              />
            </View>
          ) : visibleScenes.length ===
            0 ? (
            sceneRecoveryIssue ? (
              <RecoveryNotice
                busy={
                  loading
                }
                issue={
                  sceneRecoveryIssue
                }
                onAction={
                  recoverScenes
                }
              />
            ) : (
              <View
                style={
                  styles.empty
                }
              >
                <Text
                  selectable
                  style={
                    styles.emptyTitle
                  }
                >
                  Create a Scene first
                </Text>

                <Text
                  selectable
                  style={
                    styles.emptyText
                  }
                >
                  A Stage starts with
                  one of your own Scene
                  queues.
                </Text>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    router.replace(
                      "/scene-studio",
                    );
                  }}
                  style={({
                    pressed,
                  }) => [
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
            )
          ) : (
            <>
              {sceneRecoveryIssue ? (
                <RecoveryNotice
                  busy={
                    loading
                  }
                  issue={
                    sceneRecoveryIssue
                  }
                  onAction={
                    recoverScenes
                  }
                />
              ) : null}

              <View
                style={
                  styles.section
                }
              >
                <Text
                  selectable
                  style={
                    styles.sectionLabel
                  }
                >
                  1 · CHOOSE A SCENE
                </Text>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={
                    false
                  }
                  contentContainerStyle={
                    styles.sceneList
                  }
                >
                  {visibleScenes.map(
                    (scene) => {
                      const selected =
                        scene.id ===
                        selectedSceneId;

                      return (
                        <Pressable
                          key={
                            scene.id
                          }
                          accessibilityRole="radio"
                          accessibilityState={{
                            selected,
                          }}
                          onPress={() => {
                            chooseScene(
                              scene,
                            );
                          }}
                          style={({
                            pressed,
                          }) => [
                            styles.sceneCard,
                            selected &&
                              styles.sceneCardSelected,
                            pressed &&
                              styles.pressed,
                          ]}
                        >
                          <View
                            style={
                              styles.sceneTopRow
                            }
                          >
                            <Text
                              style={[
                                styles.sceneTrackCount,
                                selected &&
                                  styles.sceneTextSelected,
                              ]}
                            >
                              {
                                scene
                                  .tracks
                                  .length
                              }{" "}
                              TRACKS
                            </Text>

                            <View
                              style={[
                                styles.radio,
                                selected &&
                                  styles.radioSelected,
                              ]}
                            />
                          </View>

                          <Text
                            numberOfLines={
                              2
                            }
                            style={[
                              styles.sceneName,
                              selected &&
                                styles.sceneTextSelected,
                            ]}
                          >
                            {scene.name}
                          </Text>

                          <Text
                            numberOfLines={
                              2
                            }
                            style={[
                              styles.sceneActivity,
                              selected &&
                                styles.sceneActivitySelected,
                            ]}
                          >
                            {
                              scene.activity
                            }
                          </Text>
                        </Pressable>
                      );
                    },
                  )}
                </ScrollView>
              </View>

              <View
                style={
                  styles.section
                }
              >
                <Text
                  selectable
                  style={
                    styles.sectionLabel
                  }
                >
                  2 · NAME THE ROOM
                </Text>

                <TextInput
                  value={name}
                  onChangeText={
                    setName
                  }
                  placeholder="Late Night Drive Live"
                  placeholderTextColor={canalDynamicColors.muted}
                  maxLength={80}
                  returnKeyType="next"
                  style={
                    styles.input
                  }
                />

                <TextInput
                  value={activity}
                  onChangeText={
                    setActivity
                  }
                  placeholder="What is everyone doing?"
                  placeholderTextColor={canalDynamicColors.muted}
                  maxLength={120}
                  returnKeyType="done"
                  style={
                    styles.input
                  }
                />

                <Text
                  style={
                    styles.counter
                  }
                >
                  {name.length}/80
                </Text>
              </View>

              <View
                style={
                  styles.section
                }
              >
                <Text
                  selectable
                  style={
                    styles.sectionLabel
                  }
                >
                  3 · CHOOSE ACCESS
                </Text>

                <View
                  accessibilityRole="radiogroup"
                  style={
                    styles.visibilityControl
                  }
                >
                  {(
                    [
                      {
                        value:
                          "public",
                        label:
                          "Public",
                        detail:
                          "Discoverable",
                      },
                      {
                        value:
                          "private",
                        label:
                          "Private",
                        detail:
                          "Code only",
                      },
                    ] as const
                  ).map(
                    (option) => {
                      const selected =
                        visibility ===
                        option.value;

                      return (
                        <Pressable
                          key={
                            option.value
                          }
                          accessibilityRole="radio"
                          accessibilityState={{
                            selected,
                          }}
                          onPress={() => {
                            setVisibility(
                              option.value,
                            );
                            if (
                              process
                                .env
                                .EXPO_OS ===
                              "ios"
                            ) {
                              void Haptics
                                .selectionAsync();
                            }
                          }}
                          style={({
                            pressed,
                          }) => [
                            styles.visibilityOption,
                            selected &&
                              styles.visibilityOptionSelected,
                            pressed &&
                              styles.pressed,
                          ]}
                        >
                          <Text
                            style={[
                              styles.visibilityLabel,
                              selected &&
                                styles.visibilityLabelSelected,
                            ]}
                          >
                            {
                              option.label
                            }
                          </Text>

                          <Text
                            style={[
                              styles.visibilityDetail,
                              selected &&
                                styles.visibilityDetailSelected,
                            ]}
                          >
                            {
                              option.detail
                            }
                          </Text>
                        </Pressable>
                      );
                    },
                  )}
                </View>
              </View>

              {selectedScene ? (
                <View
                  style={
                    styles.queueSummary
                  }
                >
                  <Text
                    style={
                      styles.queueLabel
                    }
                  >
                    STAGE QUEUE
                  </Text>

                  <Text
                    selectable
                    style={
                      styles.queueTitle
                    }
                  >
                    {
                      selectedScene
                        .tracks
                        .length
                    }{" "}
                    tracks from{" "}
                    {
                      selectedScene.name
                    }
                  </Text>

                  <Text
                    selectable
                    numberOfLines={2}
                    style={
                      styles.queuePreview
                    }
                  >
                    {selectedScene
                      .tracks
                      .slice(
                        0,
                        3,
                      )
                      .map(
                        (track) =>
                          track.title,
                      )
                      .join(" · ")}
                  </Text>
                </View>
              ) : null}

              {error ? (
                <Text
                  selectable
                  accessibilityRole="alert"
                  style={
                    styles.error
                  }
                >
                  {error}
                </Text>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  busy:
                    creating,
                  disabled:
                    createDisabled,
                }}
                disabled={
                  createDisabled
                }
                onPress={() => {
                  void startStage();
                }}
                style={({
                  pressed,
                }) => [
                  styles.startButton,
                  createDisabled &&
                    styles.disabled,
                  pressed &&
                    styles.pressed,
                ]}
              >
                {creating ? (
                  <ActivityIndicator
                    color="#FFFFFF"
                  />
                ) : (
                  <>
                    <View
                      style={
                        styles.startLiveDot
                      }
                    />

                    <Text
                      style={
                        styles.startButtonText
                      }
                    >
                      Go Live
                    </Text>
                  </>
                )}
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: canalDynamicColors.surface,
    },

    content: {
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 48,
      gap: 22,
    },

    hero: {
      gap: 10,
    },

    liveMark: {
      alignSelf:
        "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor:
        "#FFE9DA",
    },

    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor:
        "#F04F2B",
    },

    liveMarkText: {
      color: "#C84929",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.1,
    },

    heading: {
      maxWidth: 350,
      color: canalDynamicColors.text,
      fontSize: 32,
      lineHeight: 37,
      fontWeight: "900",
      letterSpacing: -0.9,
    },

    intro: {
      color: "#746A63",
      fontSize: 15,
      lineHeight: 22,
    },

    loading: {
      minHeight: 300,
      alignItems: "center",
      justifyContent: "center",
    },

    empty: {
      gap: 12,
      padding: 24,
      borderWidth: 1,
      borderColor: "#E9DED5",
      borderRadius: 24,
      borderCurve: "continuous",
      backgroundColor: canalDynamicColors.surface,
    },

    emptyTitle: {
      color: canalDynamicColors.text,
      fontSize: 21,
      fontWeight: "900",
    },

    emptyText: {
      color: canalDynamicColors.muted,
      fontSize: 15,
      lineHeight: 21,
    },

    section: {
      gap: 10,
    },

    sectionLabel: {
      color: "#A85A29",
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1.2,
    },

    sceneList: {
      gap: 10,
      paddingRight: 16,
    },

    sceneCard: {
      width: 190,
      minHeight: 145,
      justifyContent:
        "space-between",
      gap: 10,
      padding: 16,
      borderWidth: 1,
      borderColor: "#E5DAD2",
      borderRadius: 21,
      borderCurve: "continuous",
      backgroundColor: canalDynamicColors.surface,
    },

    sceneCardSelected: {
      borderColor:
        "#F47A24",
      backgroundColor:
        "#241711",
    },

    sceneTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
    },

    sceneTrackCount: {
      color: "#A1775B",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.8,
    },

    radio: {
      width: 17,
      height: 17,
      borderWidth: 1.5,
      borderColor: "#BBAEA5",
      borderRadius: 9,
    },

    radioSelected: {
      borderWidth: 5,
      borderColor: "#F47A24",
      backgroundColor: canalDynamicColors.surface,
    },

    sceneName: {
      color: canalDynamicColors.text,
      fontSize: 18,
      lineHeight: 22,
      fontWeight: "900",
    },

    sceneTextSelected: {
      color: "#FFFFFF",
    },

    sceneActivity: {
      color: "#776D66",
      fontSize: 12,
      lineHeight: 17,
    },

    sceneActivitySelected: {
      color: "#CBBAB0",
    },

    input: {
      minHeight: 54,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: "#E2D8D0",
      borderRadius: 17,
      borderCurve: "continuous",
      backgroundColor: canalDynamicColors.surface,
      color: canalDynamicColors.text,
      fontSize: 16,
    },

    counter: {
      alignSelf:
        "flex-end",
      color: "#9A9089",
      fontSize: 11,
      fontVariant: [
        "tabular-nums",
      ],
    },

    visibilityControl: {
      flexDirection: "row",
      gap: 9,
      padding: 5,
      borderRadius: 20,
      borderCurve: "continuous",
      backgroundColor:
        "#EEE5DE",
    },

    visibilityOption: {
      flex: 1,
      minHeight: 64,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      borderRadius: 16,
      borderCurve: "continuous",
    },

    visibilityOptionSelected: {
      backgroundColor: canalDynamicColors.surface,
      boxShadow:
        "0 3px 10px rgba(58, 38, 24, 0.08)",
    },

    visibilityLabel: {
      color: canalDynamicColors.muted,
      fontSize: 15,
      fontWeight: "800",
    },

    visibilityLabelSelected: {
      color: canalDynamicColors.gold,
    },

    visibilityDetail: {
      color: canalDynamicColors.muted,
      fontSize: 11,
    },

    visibilityDetailSelected: {
      color: "#9C6D4D",
    },

    queueSummary: {
      gap: 5,
      padding: 17,
      borderRadius: 20,
      borderCurve: "continuous",
      backgroundColor:
        "#F2E9E2",
    },

    queueLabel: {
      color: "#A86134",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1,
    },

    queueTitle: {
      color: canalDynamicColors.text,
      fontSize: 15,
      fontWeight: "900",
    },

    queuePreview: {
      color: "#81756D",
      fontSize: 12,
      lineHeight: 17,
    },

    error: {
      color: "#B13E2B",
      fontSize: 14,
      lineHeight: 20,
      paddingHorizontal: 2,
    },

    startButton: {
      minHeight: 58,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      borderRadius: 19,
      borderCurve: "continuous",
      backgroundColor:
        "#F47A24",
      boxShadow:
        "0 10px 22px rgba(189, 77, 9, 0.24)",
    },

    startLiveDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor: canalDynamicColors.surface,
    },

    startButtonText: {
      color: "#FFFFFF",
      fontSize: 17,
      fontWeight: "900",
    },

    primaryButton: {
      minHeight: 52,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 17,
      backgroundColor:
        "#F47A24",
    },

    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "900",
    },

    disabled: {
      opacity: 0.55,
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
