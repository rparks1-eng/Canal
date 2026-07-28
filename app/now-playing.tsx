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
  canonicalSpotifyTrackUrl,
} from "../lib/spotify-track-links";

import {
  recordListeningHistory,
} from "../lib/canal-session";

import CanalBottomNav from "../components/CanalBottomNav";

import {
  useAuth,
} from "../providers/auth-provider";

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

async function openSpotify(
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
  const {
    user,
  } = useAuth();

  const accountKey =
    user?.id ??
    "";

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

  useEffect(() => {
    void loadPlayer();
  }, [
    loadPlayer,
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
        await openSpotify(
          currentTrack.spotifyUrl,
          currentTrack.spotifyUri,
        );

        setMessage(
          "Spotify is playing the audio. Canal is tracking the Scene session locally.",
        );
      }
    };

  const move =
    async (
      direction: -1 | 1,
    ): Promise<void> => {
      if (
        !session ||
        !scene
      ) {
        return;
      }

      const nextSession =
        movePlayerSession(
          session,
          scene,
          direction,
        );

      if (!nextSession) {
        return;
      }

      await saveSession(
        nextSession,
      );

      const track =
        scene.tracks[
          nextSession.currentIndex
        ];

      if (
        session.isPlaying &&
        track
      ) {
        await openSpotify(
          track.spotifyUrl,
          track.spotifyUri,
        );
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

  if (
    !scene ||
    !session
  ) {
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
            {storageIssue
              ? "Playback needs attention"
              : "Nothing is playing"}
          </Text>

          {storageIssue ? (
            <Text
              selectable
              style={
                styles.missingCopy
              }
            >
              {storageIssue}
            </Text>
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

            pressed &&
              styles.pressed,
          ]}
        >
          <Text
            style={
              styles.doneText
            }
          >
            Edit
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
        <View style={styles.artwork}>
          <View style={styles.orbOne} />
          <View style={styles.orbTwo} />
          <View style={styles.orbThree} />

          <Text
            style={
              styles.artworkText
            }
          >
            ◉
          </Text>
        </View>

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
            onPress={() =>
              void move(-1)
            }
            style={({ pressed }) => [
              styles.secondaryControl,

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
            onPress={() =>
              void togglePlay()
            }
            style={({ pressed }) => [
              styles.playButton,

              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.playButtonText
              }
            >
              {session.isPlaying
                ? "Ⅱ"
                : "▶"}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              void move(1)
            }
            style={({ pressed }) => [
              styles.secondaryControl,

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

        <View style={styles.sceneProfile}>
          <Text
            style={
              styles.profileTitle
            }
          >
            Scene profile
          </Text>

          <View style={styles.tags}>
            {[
              scene.activity,
              scene.energy,
              scene.familiarity,

              ...scene.emotions
                .split(",")
                .map(
                  (item) =>
                    item.trim(),
                )
                .filter(Boolean)
                .slice(0, 2),
            ].map(
              (tag) => (
                <View
                  key={tag}
                  style={
                    styles.tag
                  }
                >
                  <Text
                    style={
                      styles.tagText
                    }
                  >
                    {tag}
                  </Text>
                </View>
              ),
            )}
          </View>
        </View>

        <View style={styles.queueCard}>
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
                  style={
                    styles.queueRow
                  }
                >
                  <View
                    style={[
                      styles.queueImage,
                      styles.queueImagePlaceholder,
                    ]}
                  >
                    <Text
                      style={
                        styles.queueImageText
                      }
                    >
                      ♪
                    </Text>
                  </View>

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

      <CanalBottomNav />
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
      paddingHorizontal: 24,
    },

    missingTitle: {
      color: "#181818",
      fontSize: 22,
      fontWeight: "900",
      marginBottom: 15,
      textAlign: "center",
    },

    missingCopy: {
      color: "#746D67",
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
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#FFFFFF",
      marginRight: 10,
    },

    backText: {
      color: "#1B1B1B",
      fontSize: 34,
      lineHeight: 36,
      marginTop: -2,
    },

    headerText: {
      flex: 1,
      minWidth: 0,
    },

    headerEyebrow: {
      color: "#F47A24",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.9,
    },

    headerTitle: {
      color: "#1B1B1B",
      fontSize: 15,
      fontWeight: "800",
      marginTop: 2,
    },

    doneButton: {
      paddingHorizontal: 10,
      paddingVertical: 9,
    },

    doneText: {
      color: "#F47A24",
      fontSize: 13,
      fontWeight: "800",
    },

    content: {
      paddingHorizontal: 24,
      paddingBottom: 45,
      alignItems: "center",
    },

    artwork: {
      width: "100%",
      aspectRatio: 1,
      maxHeight: 360,
      borderRadius: 31,
      alignItems:
        "center",
      justifyContent:
        "center",
      overflow: "hidden",
      backgroundColor:
        "#2B1710",
      marginTop: 8,
    },

    orbOne: {
      position: "absolute",
      width: 220,
      height: 220,
      borderRadius: 110,
      backgroundColor:
        "#F47A24",
      top: -50,
      right: -45,
      opacity: 0.85,
    },

    orbTwo: {
      position: "absolute",
      width: 185,
      height: 185,
      borderRadius: 93,
      backgroundColor:
        "#8D3C1A",
      bottom: -50,
      left: -35,
      opacity: 0.82,
    },

    orbThree: {
      position: "absolute",
      width: 110,
      height: 110,
      borderRadius: 55,
      backgroundColor:
        "#FFB781",
      bottom: 30,
      right: 35,
      opacity: 0.72,
    },

    artworkText: {
      color: "#FFFFFF",
      fontSize: 72,
      opacity: 0.92,
    },

    trackTitle: {
      color: "#181818",
      fontSize: 25,
      fontWeight: "900",
      textAlign: "center",
      marginTop: 22,
    },

    trackArtist: {
      color: "#746D67",
      fontSize: 14,
      marginTop: 6,
    },

    progressTrack: {
      width: "100%",
      height: 5,
      borderRadius: 3,
      backgroundColor:
        "#DDD4CD",
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
      color: "#8A827B",
      fontSize: 10,
      fontVariant: [
        "tabular-nums",
      ],
    },

    timeLabel: {
      color: "#A09790",
      fontSize: 9,
    },

    controls: {
      width: "78%",
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      marginTop: 22,
    },

    secondaryControl: {
      width: 54,
      height: 54,
      borderRadius: 27,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#FFFFFF",
    },

    secondaryControlText: {
      color: "#2B2622",
      fontSize: 34,
      lineHeight: 36,
      marginTop: -2,
    },

    playButton: {
      width: 76,
      height: 76,
      borderRadius: 38,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F47A24",
    },

    playButtonText: {
      color: "#FFFFFF",
      fontSize: 27,
      fontWeight: "900",
      marginLeft: 2,
    },

    sessionTime: {
      color: "#77706A",
      fontSize: 11,
      marginTop: 15,
    },

    notice: {
      width: "100%",
      backgroundColor:
        "#FFF0E5",
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
      minHeight: 40,
      alignItems:
        "center",
      justifyContent:
        "center",
      alignSelf:
        "flex-start",
      backgroundColor:
        "#FFFFFF",
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
      backgroundColor:
        "#FFFFFF",
      borderRadius: 20,
      padding: 17,
      marginTop: 19,
    },

    profileTitle: {
      color: "#1B1B1B",
      fontSize: 16,
      fontWeight: "900",
    },

    tags: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
      marginTop: 11,
    },

    tag: {
      backgroundColor:
        "#F3ECE7",
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 7,
    },

    tagText: {
      color: "#5A524D",
      fontSize: 10,
      fontWeight: "700",
      textTransform:
        "capitalize",
    },

    queueCard: {
      width: "100%",
      backgroundColor:
        "#FFFFFF",
      borderRadius: 20,
      padding: 17,
      marginTop: 14,
    },

    queueTitle: {
      color: "#1B1B1B",
      fontSize: 16,
      fontWeight: "900",
      marginBottom: 7,
    },

    queueEmpty: {
      color: "#77706A",
      fontSize: 12,
      marginTop: 7,
    },

    queueRow: {
      flexDirection: "row",
      alignItems: "center",
      borderTopWidth: 1,
      borderTopColor:
        "#F0ECE8",
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

    queueImagePlaceholder: {
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    queueImageText: {
      color: "#8A827B",
      fontSize: 18,
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
      color: "#25211F",
      fontSize: 13,
      fontWeight: "800",
    },

    queueArtist: {
      color: "#77706A",
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
      backgroundColor:
        "#2B1710",
      marginTop: 15,
      paddingHorizontal: 15,
    },

    finishButtonText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "900",
      textAlign: "center",
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
