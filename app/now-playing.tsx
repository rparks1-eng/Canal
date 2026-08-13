import { canalDynamicColors } from "../theme/canal-dynamic-colors";
import {
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Ionicons } from "@expo/vector-icons";

import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
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
  Image,
} from "expo-image";

import {
  advancePlayerSession,
  clearPlayerSession,
  constrainPlayerSessionToScene,
  createPlayerSession,
  movePlayerSession,
  readPlayerSession,
  writePlayerSession,
} from "../lib/canal-player";

import type {
  CanalPlayerSession,
} from "../lib/canal-player";

import {
  getSceneById,
  recordScenePlay,
} from "../lib/scenes";

import type {
  StoredScene,
} from "../lib/scenes";

import {
  enqueueStoredSceneRecommendationFeedback,
} from "../lib/scene-recommendation-feedback";

import {
  captureSceneStudioScope,
  sameSceneStudioScope,
} from "../lib/scene-studio-scope";

import {
  canonicalSpotifyTrackUrl,
} from "../lib/spotify-track-links";
import { canonicalMusicProviderUrl } from "../lib/music-provider-links";

import {
  addSpotifyArtworkToStoredScene,
} from "../lib/spotify-scene-artwork";

import {
  recordListeningHistory,
} from "../lib/canal-session";
import {
  LinerNotesAction,
  LinerNotesOverlay,
} from "../components/liner-notes/LinerNotesOverlay";

import type {
  LinerNotesTrack,
} from "../components/liner-notes/LinerNotesOverlay";

import {
  useLinerNotesContext,
} from "../components/liner-notes/useLinerNotesContext";

import {
  useConnectivity,
} from "../providers/connectivity-provider";

import {
  RecoveryNotice,
} from "../components/recovery-notice";

import {
  useReconnectReload,
} from "../hooks/use-reconnect-reload";

import {
  classifyRecoveryIssue,
} from "../lib/recovery-issue";

import {
  useAuth,
} from "../providers/auth-provider";

import { canalColors } from "../theme/canal-colors";
import { canalTypography } from "../theme/canal-typography";
import { CanalAtmosphereContext } from "../theme/canal-atmosphere-context";
import { sceneAtmosphere, scenePresentation } from "../components/canal-ui/scene-signature";
import { SceneDnaPanel } from "../components/canal-ui/scene-dna-panel";
import { readAccountCanalSettings } from "../lib/app-settings";

function formatTime(
  totalSeconds: number,
): string {
  const safeSeconds =
    Math.max(
      0,
      Math.floor(
        totalSeconds,
      ),
    );

  const minutes =
    Math.floor(
      safeSeconds / 60,
    );

  const seconds =
    safeSeconds % 60;

  return `${minutes}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

async function openTrackProvider(
  track: StoredScene["tracks"][number],
): Promise<void> {
  const target = canonicalMusicProviderUrl(
    track.providerId,
    track.providerUrl,
    track.spotifyUri,
  ) ?? canonicalSpotifyTrackUrl(track.spotifyUrl, track.spotifyUri);

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

function playerIssueMessage(
  error: unknown,
): string {
  const detail =
    error instanceof Error
      ? error.message
      : "Canal could not access saved playback progress.";

  return `${detail} Your Scene is still available. Retry to resume saving progress.`;
}

export default function NowPlayingScreen() {
  const { setOverride } = use(CanalAtmosphereContext);
  const {
    user,
    accountEpoch,
    sessionGeneration,
  } = useAuth();

  const playbackScope =
    captureSceneStudioScope({
      userId: user?.id,
      accountEpoch,
      sessionGeneration,
    });

  const playbackScopeRef =
    useRef(playbackScope);

  playbackScopeRef.current =
    playbackScope;

  const {
    status: connectivityStatus,
  } = useConnectivity();

  const accountKey =
    user?.id ??
    "";

  const [trueBlackPlayback, setTrueBlackPlayback] = useState(false);
  useEffect(() => {
    let active = true;
    if (!accountKey) {
      setTrueBlackPlayback(false);
      return () => { active = false; };
    }
    void readAccountCanalSettings(accountKey).then((settings) => {
      if (active) setTrueBlackPlayback(settings.trueBlackPlayback);
    });
    return () => { active = false; };
  }, [accountKey]);

  const params =
    useLocalSearchParams<{
      sceneId?: string;
    }>();

  const requestedSceneId =
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

  useEffect(() => {
    if (!scene) return;
    setOverride(sceneAtmosphere(scene));
    return () => setOverride(null);
  }, [scene, setOverride]);

  const [readyArtworkUrls, setReadyArtworkUrls] =
    useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    let active = true;
    setReadyArtworkUrls(new Set());
    const urls = Array.from(new Set(
      scene?.tracks
        .map((track) => track.imageUrl)
        .filter((url): url is string => Boolean(url)) ?? [],
    ));
    urls.forEach((url) => {
      void Image.prefetch(url).then((ready) => {
        if (!active || !ready) return;
        setReadyArtworkUrls((current) => {
          const next = new Set(current);
          next.add(url);
          return next;
        });
      }).catch(() => undefined);
    });
    return () => { active = false; };
  }, [scene?.tracks]);

  const [contextTrack, setContextTrack] =
    useState<LinerNotesTrack | null>(null);
  const linerNotes = useLinerNotesContext({
    track: contextTrack,
    visible: Boolean(contextTrack),
    userId: user?.id ?? null,
    sessionGeneration,
    connectivityStatus,
  });

  useEffect(() => {
    setContextTrack(null);
  }, [accountKey]);

  const [
    session,
    setSession,
  ] =
    useState<CanalPlayerSession | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    storageIssue,
    setStorageIssue,
  ] = useState("");

  const [
    storageBusy,
    setStorageBusy,
  ] = useState(false);

  const mountedRef =
    useRef(false);

  const playerLoadGenerationRef =
    useRef(0);

  const requestedSceneIdRef =
    useRef(requestedSceneId);

  const requestedSceneAccountKeyRef =
    useRef(accountKey);

  if (
    requestedSceneIdRef.current !==
    requestedSceneId
  ) {
    requestedSceneIdRef.current =
      requestedSceneId;

    requestedSceneAccountKeyRef.current =
      accountKey;
  } else if (
    !requestedSceneAccountKeyRef.current &&
    accountKey
  ) {
    requestedSceneAccountKeyRef.current =
      accountKey;
  }

  const accountKeyRef =
    useRef(accountKey);

  accountKeyRef.current =
    accountKey;

  const playerLoadAccountKeyRef =
    useRef(accountKey);

  const finishingRef =
    useRef(false);

  const playbackControlInFlightRef =
    useRef(false);

  const artworkWindowInFlightRef =
    useRef<string | null>(null);

  const isCurrentPlayerLoad =
    useCallback(
      (
        generation: number,
      ): boolean =>
        mountedRef.current &&
        !finishingRef.current &&
        playerLoadGenerationRef.current ===
          generation &&
        playerLoadAccountKeyRef.current ===
          accountKeyRef.current,
      [],
    );

  const showStorageIssue =
    useCallback(
      (
        error: unknown,
      ): void => {
        if (!mountedRef.current) {
          return;
        }

        setStorageIssue(
          playerIssueMessage(
            error,
          ),
        );
      },
      [],
    );

  const persistPlayerSession =
    useCallback(
      async (
        next: CanalPlayerSession,
        generation: number,
      ): Promise<boolean> => {
        if (
          !isCurrentPlayerLoad(
            generation,
          )
        ) {
          return false;
        }

        try {
          await writePlayerSession(
            next,
          );

          if (
            !isCurrentPlayerLoad(
              generation,
            )
          ) {
            return false;
          }

          setStorageIssue(
            "",
          );

          return true;
        } catch (error) {
          if (
            isCurrentPlayerLoad(
              generation,
            )
          ) {
            showStorageIssue(
              error,
            );
          }

          return false;
        }
      },
      [
        isCurrentPlayerLoad,
        showStorageIssue,
      ],
    );

  const loadPlayer =
    useCallback(
      async (): Promise<void> => {
        const loadGeneration =
          playerLoadGenerationRef.current +
          1;

        const requestedSceneForAccount =
          requestedSceneAccountKeyRef.current ===
          accountKey
            ? requestedSceneId
            : "";

        playerLoadGenerationRef.current =
          loadGeneration;

        playerLoadAccountKeyRef.current =
          accountKey;

        finishingRef.current =
          false;

        if (!mountedRef.current) {
          return;
        }

        setScene(
          null,
        );

        setSession(
          null,
        );

        setMessage(
          "",
        );

        setStorageIssue(
          "",
        );

        if (!accountKey) {
          setStorageBusy(
            false,
          );

          setLoading(
            false,
          );

          return;
        }

        setLoading(
          true,
        );

        setStorageBusy(
          true,
        );

        try {
          const storedSession =
            await readPlayerSession();

          if (
            !isCurrentPlayerLoad(
              loadGeneration,
            )
          ) {
            return;
          }

          const sceneId =
            requestedSceneForAccount ||
            storedSession?.sceneId ||
            "";

          const storedScene =
            sceneId
              ? await getSceneById(
                  sceneId,
                )
              : null;

          if (
            !isCurrentPlayerLoad(
              loadGeneration,
            )
          ) {
            return;
          }

          setScene(
            storedScene,
          );

          if (!storedScene) {
            setSession(
              null,
            );

            setStorageIssue(
              "",
            );

            return;
          }

          const restoredSession =
            storedSession
              ? constrainPlayerSessionToScene(
                  storedSession,
                  storedScene,
                )
              : null;

          if (restoredSession) {
            setSession(
              restoredSession,
            );

            await persistPlayerSession(
              restoredSession,
              loadGeneration,
            );
          } else {
            const createdSession =
              await createPlayerSession(
                storedScene,
              );

            if (
              !isCurrentPlayerLoad(
                loadGeneration,
              )
            ) {
              await clearPlayerSession(
                createdSession.id,
              );

              return;
            }

            setSession(
              createdSession,
            );

            setStorageIssue(
              "",
            );
          }
        } catch (error) {
          if (
            isCurrentPlayerLoad(
              loadGeneration,
            )
          ) {
            showStorageIssue(
              error,
            );
          }
        } finally {
          if (
            isCurrentPlayerLoad(
              loadGeneration,
            )
          ) {
            setStorageBusy(
              false,
            );

            setLoading(
              false,
            );
          }
        }
      },
      [
        isCurrentPlayerLoad,
        accountKey,
        persistPlayerSession,
        requestedSceneId,
        showStorageIssue,
      ],
    );

  useEffect(() => {
    mountedRef.current =
      true;

    return () => {
      mountedRef.current =
        false;

      finishingRef.current =
        true;

      playerLoadGenerationRef.current +=
        1;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadPlayer();

      return () => {
        playerLoadGenerationRef.current += 1;
      };
    }, [loadPlayer]),
  );

  useReconnectReload(loadPlayer);

  const storageRecoveryIssue = useMemo(
    () =>
      storageIssue
        ? classifyRecoveryIssue(new Error(storageIssue), {
            service: "canal",
            connectivityStatus,
          })
        : null,
    [connectivityStatus, storageIssue],
  );

  useEffect(() => {
    if (
      !scene ||
      scene.tracks.length === 0
    ) {
      return;
    }

    const loadGeneration =
      playerLoadGenerationRef.current;

    const requestKey = [
      accountKey,
      scene.id,
      scene.tracks
        .map(
          (track) =>
            `${track.id}:${track.imageUrl ?? ""}`,
        )
        .join(","),
    ].join(":");

    if (
      artworkWindowInFlightRef.current ===
      requestKey
    ) {
      return;
    }

    artworkWindowInFlightRef.current =
      requestKey;

    void addSpotifyArtworkToStoredScene(
      scene,
    )
      .then((enriched) => {
        if (
          !isCurrentPlayerLoad(
            loadGeneration,
          )
        ) {
          return;
        }

        setScene((current) => {
          if (
            !current ||
            current.id !==
              enriched.id
          ) {
            return current;
          }

          const artworkChanged =
            enriched.tracks.some(
              (track, index) =>
                track.imageUrl !==
                current.tracks[index]
                  ?.imageUrl,
            );

          return artworkChanged
            ? {
                ...current,
                tracks:
                  enriched.tracks,
              }
            : current;
        });
      })
      .catch(() => {
        // Artwork is optional; playback remains usable when Spotify oEmbed is unavailable.
      })
      .finally(() => {
        if (
          artworkWindowInFlightRef.current ===
          requestKey
        ) {
          artworkWindowInFlightRef.current =
            null;
        }
      });
  }, [
    accountKey,
    isCurrentPlayerLoad,
    scene,
  ]);

  useEffect(() => {
    if (
      !session?.isPlaying ||
      !scene
    ) {
      return;
    }

    const loadGeneration =
      playerLoadGenerationRef.current;

    const timer =
      setInterval(() => {
        if (
          !isCurrentPlayerLoad(
            loadGeneration,
          )
        ) {
          return;
        }

        setSession(
          (current) => {
            if (
              !current ||
              !isCurrentPlayerLoad(
                loadGeneration,
              )
            ) {
              return current;
            }

            const updated =
              advancePlayerSession(
                current,
                scene,
              );

            if (!updated) {
              return null;
            }

            if (
              updated.elapsedSeconds %
                5 ===
                0 ||
              updated.currentIndex !==
                current.currentIndex ||
              updated.isPlaying !==
                current.isPlaying
            ) {
              void persistPlayerSession(
                updated,
                loadGeneration,
              );
            }

            return updated;
          },
        );
      }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [
    isCurrentPlayerLoad,
    persistPlayerSession,
    scene,
    session?.isPlaying,
  ]);

  const currentTrack =
    scene &&
    session &&
    scene.tracks[
      session.currentIndex
    ]
      ? scene.tracks[
          session.currentIndex
        ]
      : null;

  const currentDurationSeconds =
    Math.max(
      1,
      Math.round(
        (currentTrack
          ?.durationMs ??
          210_000) /
          1000,
      ),
    );

  const estimatedTrackElapsed =
    session
      ? Math.min(
          currentDurationSeconds,
          session.trackElapsedSeconds,
        )
      : 0;

  const progress =
    Math.min(
      1,
      estimatedTrackElapsed /
        currentDurationSeconds,
    );

  const queue =
    useMemo(
      () =>
        scene && session
          ? scene.tracks.slice(
              session.currentIndex +
                1,
              session.currentIndex +
                5,
            )
          : [],
      [
        scene,
        session,
      ],
    );

  const saveSession =
    useCallback(
      async (
        next: CanalPlayerSession,
      ): Promise<void> => {
        const loadGeneration =
          playerLoadGenerationRef.current;

        if (
          !isCurrentPlayerLoad(
            loadGeneration,
          )
        ) {
          return;
        }

        setSession(
          next,
        );

        await persistPlayerSession(
          next,
          loadGeneration,
        );
      },
      [
        isCurrentPlayerLoad,
        persistPlayerSession,
      ],
    );

  const togglePlay =
    async (): Promise<void> => {
      if (
        !session ||
        !currentTrack
      ) {
        return;
      }

      const next = {
        ...session,

        isPlaying:
          !session.isPlaying,

        trackElapsedSeconds:
          !session.isPlaying &&
          session.trackElapsedSeconds >=
            currentDurationSeconds
            ? 0
            : session.trackElapsedSeconds,
      };

      await saveSession(next);

      if (next.isPlaying) {
        await openTrackProvider(currentTrack);

        setMessage(
          "Your music service is playing the audio. Canal is tracking the Scene session locally.",
        );
      }
    };

  const move =
    async (
      direction: -1 | 1,
    ): Promise<void> => {
      if (
        !session ||
        !scene ||
        playbackControlInFlightRef.current
      ) {
        return;
      }

      const operationScope =
        playbackScopeRef.current;
      const operationGeneration =
        playerLoadGenerationRef.current;
      const operationSession = session;
      const operationScene = scene;
      const operationTrack =
        operationScene.tracks[
          operationSession.currentIndex
        ];

      const restartingCurrentTrack =
        direction === -1 &&
        operationSession.trackElapsedSeconds > 3;

      const nextSession =
        restartingCurrentTrack
          ? {
              ...operationSession,
              trackElapsedSeconds: 0,
            }
          : movePlayerSession(
              operationSession,
              operationScene,
              direction,
            );

      if (!nextSession) {
        return;
      }

      playbackControlInFlightRef.current = true;

      try {
        if (
          operationScope &&
          operationTrack &&
          (direction === 1 || restartingCurrentTrack)
        ) {
          await enqueueStoredSceneRecommendationFeedback({
            scope: operationScope,
            currentScope: () => playbackScopeRef.current,
            scene: operationScene,
            action: direction === 1 ? "skip" : "replay",
            trackIds: [operationTrack.id],
          }).catch(() => []);
        }

        if (
          !isCurrentPlayerLoad(operationGeneration) ||
          !sameSceneStudioScope(
            operationScope,
            playbackScopeRef.current,
          )
        ) {
          return;
        }

        await saveSession(
          nextSession,
        );

        const track =
          operationScene.tracks[
            nextSession.currentIndex
          ];

        if (
          operationSession.isPlaying &&
          track &&
          isCurrentPlayerLoad(operationGeneration) &&
          sameSceneStudioScope(operationScope, playbackScopeRef.current)
        ) {
          await openTrackProvider(track);
        }
      } finally {
        playbackControlInFlightRef.current = false;
      }
    };

  const finish =
    async (): Promise<void> => {
      if (
        !session ||
        !scene ||
        !session.ownerId ||
        session.ownerId !==
          accountKeyRef.current ||
        playerLoadAccountKeyRef.current !==
          accountKeyRef.current ||
        storageBusy ||
        finishingRef.current
      ) {
        return;
      }

      finishingRef.current =
        true;

      playerLoadGenerationRef.current +=
        1;

      const finishGeneration =
        playerLoadGenerationRef.current;

      const finishOwnerId =
        session.ownerId;

      setSession(
        (current) =>
          current?.id ===
          session.id
            ? {
                ...current,
                isPlaying:
                  false,
              }
            : current,
      );

      setStorageBusy(
        true,
      );

      try {
        const persistedSession =
          await readPlayerSession();

        if (
          !mountedRef.current ||
          playerLoadGenerationRef.current !==
            finishGeneration ||
          accountKeyRef.current !==
            finishOwnerId
        ) {
          return;
        }

        if (
          !persistedSession ||
          persistedSession.id !==
            session.id ||
          persistedSession.ownerId !==
            finishOwnerId
        ) {
          throw new Error(
            "Playback changed before Canal could finish this session.",
          );
        }

        await Promise.all([
          recordListeningHistory({
            sceneId:
              scene.id,

            sceneName:
              scene.name,

            startedAt:
              session.startedAt,

            completedAt:
              new Date().toISOString(),

            tracksPlayed:
              Math.min(
                scene.tracks.length,
                session.currentIndex +
                  1,
              ),

            durationSeconds:
              session.elapsedSeconds,
          }),

          recordScenePlay(
            scene.id,
          ),
        ]);

        await clearPlayerSession(
          session.id,
        );

        if (
          mountedRef.current &&
          finishingRef.current &&
          accountKeyRef.current ===
            finishOwnerId &&
          playerLoadGenerationRef.current ===
            finishGeneration
        ) {
          setStorageIssue(
            "",
          );

          router.replace({
            pathname:
              "/scene-feedback",

            params: {
              sceneId:
                scene.id,
            },
          });
        }
      } catch (error) {
        if (
          mountedRef.current &&
          accountKeyRef.current ===
            finishOwnerId &&
          playerLoadGenerationRef.current ===
            finishGeneration
        ) {
          finishingRef.current =
            false;

          showStorageIssue(
            error,
          );
        }
      } finally {
        if (
          mountedRef.current &&
          accountKeyRef.current ===
            finishOwnerId &&
          playerLoadGenerationRef.current ===
            finishGeneration
        ) {
          setStorageBusy(
            false,
          );
        }
      }
    };

  const recoverStorage =
    async (): Promise<void> => {
      if (storageBusy) {
        return;
      }

      if (!session) {
        await loadPlayer();

        return;
      }

      setStorageBusy(
        true,
      );

      const loadGeneration =
        playerLoadGenerationRef.current;

      await persistPlayerSession(
        session,
        loadGeneration,
      );

      if (
        isCurrentPlayerLoad(
          loadGeneration,
        )
      ) {
        setStorageBusy(
          false,
        );
      }
    };

  if (
    loading ||
    playerLoadAccountKeyRef.current !==
      accountKey
  ) {
    return (
      <SafeAreaView
        style={[styles.safeArea, trueBlackPlayback && styles.trueBlackPlayback]}
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

  if (
    !scene ||
    !session
  ) {
    return (
      <SafeAreaView
        style={[styles.safeArea, trueBlackPlayback && styles.trueBlackPlayback]}
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
            {storageIssue
              ? "Playback needs attention"
              : "Nothing is playing"}
          </Text>

          {storageRecoveryIssue ? (
            <RecoveryNotice
              busy={storageBusy}
              issue={storageRecoveryIssue}
              onAction={recoverStorage}
            />
          ) : null}

          {storageIssue ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                busy:
                  storageBusy,
                disabled:
                  storageBusy,
              }}
              disabled={
                storageBusy
              }
              onPress={() =>
                void recoverStorage()
              }
              style={
                styles.primaryButton
              }
            >
              {storageBusy ? (
                <ActivityIndicator
                  color="#FFFFFF"
                />
              ) : (
                <Text
                  style={
                    styles.primaryButtonText
                  }
                >
                  Retry Playback
                </Text>
              )}
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.replace(
                "/(tabs)/library",
              )
            }
            style={[
              styles.primaryButton,

              storageIssue &&
                styles.centerSecondaryButton,
            ]}
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

  if (!currentTrack) {
    return (
      <SafeAreaView
        style={[styles.safeArea, trueBlackPlayback && styles.trueBlackPlayback]}
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
            This Scene has no tracks
          </Text>

          <Text
            selectable
            style={
              styles.missingCopy
            }
          >
            Add at least one track before starting playback.
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push(
                "/scene-preview",
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
              Edit Scene
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.replace(
                "/(tabs)/library",
              )
            }
            style={[
              styles.primaryButton,
              styles.centerSecondaryButton,
            ]}
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

  const presentation = scenePresentation(scene);

  return (
    <SafeAreaView
      style={[styles.safeArea, trueBlackPlayback && styles.trueBlackPlayback]}
      edges={[
        "top",
        "bottom",
      ]}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back from Now Playing"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(tabs)");
            }
          }}
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: `${presentation.colors[2]}30` },

            pressed &&
              styles.pressed,
          ]}
        >
          <Ionicons color={canalDynamicColors.text} name="chevron-back" size={24} />
        </Pressable>

        <View
          style={
            styles.headerText
          }
        >
          <Text
            style={
              styles.headerEyebrow
            }
          >
            NOW PLAYING
          </Text>

          <Text
            numberOfLines={1}
            style={
              styles.headerTitle
            }
          >
            {scene.name}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit Scene"
          onPress={() =>
            router.push(
              "/scene-preview",
            )
          }
          style={({ pressed }) => [
            styles.doneButton,
            { backgroundColor: `${presentation.colors[2]}30` },

            pressed &&
              styles.pressed,
          ]}
        >
          <Ionicons color={canalDynamicColors.text} name="options-outline" size={22} />
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
        {currentTrack.imageUrl && readyArtworkUrls.has(currentTrack.imageUrl) ? (
          <Image
            accessibilityLabel={`${currentTrack.title} album artwork`}
            cachePolicy="memory-disk"
            contentFit="cover"
            source={{ uri: currentTrack.imageUrl }}
            style={[styles.artwork, { borderColor: `${presentation.accent}55` }]}
            transition={180}
          />
        ) : null}

        <Text
          numberOfLines={2}
          style={styles.trackTitle}
        >
          {currentTrack.title}
        </Text>

        <Text
          numberOfLines={1}
          style={styles.trackArtist}
        >
          {currentTrack.artist}
        </Text>

        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,

              {
                backgroundColor: presentation.accent,
                width:
                  `${progress * 100}%`,
              },
            ]}
          />
        </View>

        <View style={styles.timeRow}>
          <Text style={styles.timeText}>
            {formatTime(
              estimatedTrackElapsed,
            )}
          </Text>

          <Text style={styles.timeLabel}>
            Estimated progress
          </Text>

          <Text style={styles.timeText}>
            {formatTime(
              currentDurationSeconds,
            )}
          </Text>
        </View>

        <View style={styles.controls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous track"
            onPress={() =>
              void move(-1)
            }
            style={({ pressed }) => [
              styles.secondaryControl,
              { backgroundColor: `${presentation.colors[2]}30` },

              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.secondaryControlText
              }
            >
              ‹
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={session.isPlaying ? "Pause Scene" : "Play Scene"}
            accessibilityState={{ selected: session.isPlaying }}
            onPress={() =>
              void togglePlay()
            }
            style={({ pressed }) => [
              styles.playButton,
              { backgroundColor: presentation.accent },

              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={[styles.playButtonText, { color: presentation.accentText }]}
            >
              {session.isPlaying
                ? "Ⅱ"
                : "▶"}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next track"
            onPress={() =>
              void move(1)
            }
            style={({ pressed }) => [
              styles.secondaryControl,
              { backgroundColor: `${presentation.colors[2]}30` },

              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.secondaryControlText
              }
            >
              ›
            </Text>
          </Pressable>
        </View>

        <Text style={styles.sessionTime}>
          Scene session:{" "}
          {formatTime(
            session.elapsedSeconds,
          )}
        </Text>

        <View style={styles.playbackActions}>
          <LinerNotesAction
            label="Context"
            onPress={() => setContextTrack({
              title: currentTrack.title,
              artist: currentTrack.artist,
            })}
            style={[styles.playbackAction, { backgroundColor: `${presentation.colors[2]}24` }]}
          />
          <Pressable
            accessibilityLabel="View Scene details"
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/scenes/[sceneId]", params: { sceneId: scene.id } })}
            style={[styles.playbackAction, { backgroundColor: `${presentation.colors[2]}24` }]}
          >
            <Ionicons color={canalDynamicColors.text} name="sparkles-outline" size={18} />
            <Text style={styles.playbackActionText}>Scene details</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Create a Snapshot from this Scene"
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/scene-snapshot", params: { sceneId: scene.id } } as never)}
            style={[styles.playbackAction, { backgroundColor: `${presentation.colors[2]}24` }]}
          >
            <Ionicons color={canalDynamicColors.text} name="camera-outline" size={18} />
            <Text style={styles.playbackActionText}>Snapshot</Text>
          </Pressable>
        </View>

        {message ? (
          <View style={styles.notice}>
            <Text
              style={
                styles.noticeText
              }
            >
              {message}
            </Text>
          </View>
        ) : null}

        {storageIssue ? (
          <View
            style={
              styles.storageNotice
            }
          >
            <Text
              selectable
              style={
                styles.storageNoticeTitle
              }
            >
              Playback progress needs attention
            </Text>

            <Text
              selectable
              style={
                styles.storageNoticeText
              }
            >
              {storageIssue}
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry saving playback progress"
              accessibilityState={{
                busy:
                  storageBusy,
                disabled:
                  storageBusy,
              }}
              disabled={
                storageBusy
              }
              onPress={() =>
                void recoverStorage()
              }
              style={({ pressed }) => [
                styles.storageRetryButton,

                pressed &&
                  styles.pressed,
              ]}
            >
              {storageBusy ? (
                <ActivityIndicator
                  color="#8F2D1D"
                />
              ) : (
                <Text
                  style={
                    styles.storageRetryText
                  }
                >
                  Retry saving progress
                </Text>
              )}
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.sceneProfile, { backgroundColor: `${presentation.colors[2]}20` }]}>
          <View style={styles.profileHeader}>
            <Text style={styles.profileTitle}>Scene profile</Text>
            <Text style={[styles.profileName, { color: presentation.accent }]}>{scene.name}</Text>
          </View>
          <SceneDnaPanel accent={presentation.accent} scene={scene} />
        </View>

        <View style={[styles.queueCard, { backgroundColor: `${presentation.colors[2]}20` }]}>
          <Text
            style={
              styles.queueTitle
            }
          >
            Up next
          </Text>

          {queue.length === 0 ? (
            <Text
              style={
                styles.queueEmpty
              }
            >
              This is the last track.
            </Text>
          ) : (
            queue.map(
              (track, index) => (
                <View
                  key={`${track.id}-${index}`}
                  style={[styles.queueRow, { borderTopColor: `${presentation.accent}24` }]}
                >
                  {track.imageUrl && readyArtworkUrls.has(track.imageUrl) ? (
                    <Image
                      accessibilityLabel={`${track.title} album artwork`}
                      cachePolicy="memory-disk"
                      contentFit="cover"
                      source={{ uri: track.imageUrl }}
                      style={styles.queueImage}
                      transition={120}
                    />
                  ) : null}

                  <Text
                    style={
                      styles.queueNumber
                    }
                  >
                    {session.currentIndex +
                      index +
                      2}
                  </Text>

                  <View
                    style={
                      styles.queueText
                    }
                  >
                    <Text
                      numberOfLines={1}
                      style={
                        styles.queueTrack
                      }
                    >
                      {track.title}
                    </Text>

                    <Text
                      numberOfLines={1}
                      style={
                        styles.queueArtist
                      }
                    >
                      {track.artist}
                    </Text>
                  </View>

                  <LinerNotesAction
                    compact
                    onPress={() =>
                      setContextTrack({
                        title: track.title,
                        artist: track.artist,
                      })
                    }
                  />
                </View>
              ),
            )
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() =>
            void finish()
          }
          style={({ pressed }) => [
            styles.finishButton,
            { backgroundColor: `${presentation.colors[2]}2E` },

            pressed &&
              styles.pressed,
          ]}
        >
          <Text
            style={
              styles.finishButtonText
            }
          >
            Finish Scene and Give Feedback
          </Text>
        </Pressable>
      </ScrollView>

      <LinerNotesOverlay
        context={linerNotes.context}
        onClose={() => setContextTrack(null)}
        onRetry={linerNotes.retry}
        state={linerNotes.state}
        track={contextTrack}
        visible={Boolean(contextTrack)}
      />

    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: "transparent",
    },
    trueBlackPlayback: {
      backgroundColor: "#000000",
    },

    center: {
      flex: 1,
      alignItems:
        "center",
      justifyContent:
        "center",
      paddingHorizontal: 24,
    },

    missingTitle: {
      color: canalDynamicColors.text,
      fontSize: 22,
      fontWeight: "900",
      marginBottom: 15,
      textAlign: "center",
    },

    missingCopy: {
      color: canalDynamicColors.muted,
      fontSize: 14,
      lineHeight: 21,
      marginBottom: 18,
      maxWidth: 360,
      textAlign: "center",
    },

    header: {
      flexDirection: "row",
      alignItems: "center",
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
      backgroundColor: "rgba(5, 42, 58, 0.38)",
      marginRight: 10,
    },

    backText: {
      color: canalColors.dark.ink,
      fontSize: 34,
      lineHeight: 36,
      marginTop: -2,
    },

    headerText: {
      flex: 1,
      minWidth: 0,
    },

    headerEyebrow: {
      color: canalDynamicColors.gold,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.9,
    },

    headerTitle: {
      color: canalDynamicColors.text,
      fontSize: 15,
      fontWeight: "800",
      marginTop: 2,
    },

    doneButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(5, 42, 58, 0.30)",
    },

    doneText: {
      color: canalDynamicColors.gold,
      fontSize: 13,
      fontWeight: "800",
    },

    content: {
      paddingHorizontal: 18,
      paddingBottom: 120,
      alignItems: "center",
      gap: 10,
    },

    artwork: {
      width: "88%",
      maxWidth: 330,
      aspectRatio: 1,
      borderRadius: 22,
      borderCurve: "continuous",
      alignItems:
        "center",
      justifyContent:
        "center",
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      backgroundColor:
        "#2B1710",
      marginTop: 2,
      boxShadow: "0 18px 34px rgba(7, 32, 48, 0.22)",
    },

    trackTitle: {
      ...canalTypography.title,
      color: canalDynamicColors.text,
      textAlign: "center",
      marginTop: 6,
      fontFamily: "Georgia",
    },

    trackArtist: {
      color: canalDynamicColors.muted,
      fontSize: 14,
      marginTop: 6,
    },

    progressTrack: {
      width: "100%",
      height: 5,
      borderRadius: 3,
      backgroundColor: "rgba(255, 255, 255, 0.25)",
      overflow: "hidden",
      marginTop: 23,
    },

    progressFill: {
      height: "100%",
      backgroundColor:
        "#F47A24",
    },

    timeRow: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      marginTop: 7,
    },

    timeText: {
      color: canalDynamicColors.muted,
      fontSize: 10,
      fontVariant: [
        "tabular-nums",
      ],
    },

    timeLabel: {
      color: canalDynamicColors.muted,
      fontSize: 9,
    },

    controls: {
      width: "66%",
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      marginTop: 22,
    },

    secondaryControl: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor: "rgba(5, 42, 58, 0.38)",
    },

    secondaryControlText: {
      color: canalDynamicColors.text,
      fontSize: 34,
      lineHeight: 36,
      marginTop: -2,
    },

    playButton: {
      width: 66,
      height: 66,
      borderRadius: 33,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F47A24",
    },

    playButtonText: {
      color: "#4E4287",
      fontSize: 27,
      fontWeight: "900",
      marginLeft: 2,
    },

    sessionTime: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      marginTop: 15,
    },

    notice: {
      width: "100%",
      backgroundColor: canalDynamicColors.warningSurface,
      borderRadius: 15,
      padding: 13,
      marginTop: 16,
    },

    noticeText: {
      color: "#7B5234",
      fontSize: 11,
      lineHeight: 17,
      textAlign: "center",
    },

    storageNotice: {
      width: "100%",
      backgroundColor:
        "#FDEAE5",
      borderColor:
        "#F1B8AA",
      borderWidth: 1,
      borderRadius: 17,
      borderCurve:
        "continuous",
      padding: 14,
      gap: 7,
      marginTop: 16,
    },

    storageNoticeTitle: {
      color: "#8F2D1D",
      fontSize: 13,
      fontWeight: "900",
    },

    storageNoticeText: {
      color: "#7A4034",
      fontSize: 11,
      lineHeight: 17,
    },

    storageRetryButton: {
      minHeight: 48,
      alignItems:
        "center",
      justifyContent:
        "center",
      alignSelf:
        "flex-start",
      backgroundColor: canalColors.dark.surface,
      borderRadius: 12,
      borderCurve:
        "continuous",
      paddingHorizontal: 14,
      marginTop: 3,
    },

    storageRetryText: {
      color: "#8F2D1D",
      fontSize: 12,
      fontWeight: "800",
    },

    sceneProfile: {
      width: "100%",
      borderRadius: 20,
      borderCurve: "continuous",
      paddingHorizontal: 15,
      paddingVertical: 13,
      marginTop: 19,
    },

    profileHeader: {
      minHeight: 34,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingHorizontal: 2,
    },

    profileTitle: {
      color: canalDynamicColors.text,
      fontSize: 16,
      fontWeight: "900",
    },

    profileName: {
      flex: 1,
      fontSize: 11,
      fontWeight: "900",
      textAlign: "right",
    },

    tags: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
      marginTop: 11,
    },

    tag: {
      backgroundColor: "rgba(235, 255, 250, 0.12)",
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 7,
    },

    tagText: {
      color: canalDynamicColors.muted,
      fontSize: 10,
      fontWeight: "700",
      textTransform:
        "capitalize",
    },

    queueCard: {
      width: "100%",
      borderWidth: 0,
      borderRadius: 20,
      borderCurve: "continuous",
      padding: 17,
      marginTop: 14,
    },

    queueTitle: {
      color: canalDynamicColors.text,
      fontSize: 16,
      fontWeight: "900",
      marginBottom: 7,
    },

    queueEmpty: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      marginTop: 7,
    },

    queueRow: {
      flexDirection: "row",
      alignItems: "center",
      borderTopWidth: 1,
      borderTopColor: "rgba(235, 255, 250, 0.10)",
      paddingVertical: 11,
    },

    queueImage: {
      width: 42,
      height: 42,
      borderRadius: 8,
      borderCurve:
        "continuous",
      backgroundColor:
        "#F1E7DF",
      marginRight: 8,
    },

    queueNumber: {
      width: 25,
      color: "#948C85",
      fontSize: 10,
      textAlign: "center",
      marginRight: 8,
    },

    queueText: {
      flex: 1,
      minWidth: 0,
    },

    queueTrack: {
      color: "#F7FFFD",
      fontSize: 13,
      fontWeight: "800",
    },

    queueArtist: {
      color: canalDynamicColors.muted,
      fontSize: 10,
      marginTop: 3,
    },

    finishButton: {
      width: "100%",
      minHeight: 52,
      borderRadius: 17,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderWidth: 0,
      marginTop: 15,
      paddingHorizontal: 15,
    },

    finishButtonText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "900",
      textAlign: "center",
    },

    playbackActions: {
      width: "100%",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 2,
    },

    playbackAction: {
      minHeight: 48,
      flex: 1,
      minWidth: 104,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      paddingHorizontal: 12,
      borderWidth: 0,
      borderRadius: 16,
      borderCurve: "continuous",
    },

    playbackActionText: {
      color: "#F4FFFC",
      fontSize: 12,
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

    centerSecondaryButton: {
      backgroundColor:
        "#2B1710",
      marginTop: 10,
    },

    pressed: {
      opacity: 0.7,
    },
  });
