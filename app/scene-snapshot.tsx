import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
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

import {
  classifyAnalyticsFailure,
  recordAnalyticsEvent,
  recordAnalyticsFailure,
} from "../lib/analytics";

import {
  publishSnapshot as publishToLocalActivity,
} from "../lib/canal-session";

import {
  classifyRecoveryIssue,
} from "../lib/recovery-issue";

import {
  createSnapshotWithStatus,
  syncSnapshotWithStatus,
} from "../lib/snapshots";

import {
  getSceneById,
  sceneDurationMinutes,
  sceneShareText,
} from "../lib/scenes";

import type {
  StoredScene,
} from "../lib/scenes";

import {
  useConnectivity,
} from "../providers/connectivity-provider";

function closeSceneSnapshot(): void {
  if (router.canGoBack()) {
    router.back();

    return;
  }

  router.replace(
    "/(tabs)/library",
  );
}

export default function SceneSnapshotScreen() {
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
    isLoadingScene,
    setIsLoadingScene,
  ] = useState(true);

  const [
    sceneLoadError,
    setSceneLoadError,
  ] = useState<unknown>(
    null,
  );

  const [
    caption,
    setCaption,
  ] = useState("");

  const [
    published,
    setPublished,
  ] = useState(false);

  const [
    isPublishing,
    setIsPublishing,
  ] = useState(false);

  const [
    pendingSnapshotId,
    setPendingSnapshotId,
  ] = useState("");

  const [
    publishErrorCause,
    setPublishErrorCause,
  ] = useState<unknown>(
    null,
  );

  const publishInFlight =
    useRef(false);

  const loadScene =
    useCallback(
      async (): Promise<void> => {
        setIsLoadingScene(
          true,
        );

        setSceneLoadError(
          null,
        );

        if (!sceneId) {
          setScene(
            null,
          );

          setIsLoadingScene(
            false,
          );

          return;
        }

        try {
          setScene(
            await getSceneById(
              sceneId,
            ),
          );
        } catch (error) {
          console.error(
            "Unable to load Scene for Snapshot:",
            error,
          );

          const loadFailure =
            error ??
            new Error(
              "Canal could not load this Scene.",
            );

          setScene(
            null,
          );

          setSceneLoadError(
            () =>
              loadFailure,
          );
        } finally {
          setIsLoadingScene(
            false,
          );
        }
      },
      [
        sceneId,
      ],
    );

  useEffect(() => {
    void loadScene();
  }, [
    loadScene,
  ]);

  const share =
    async (): Promise<void> => {
      if (!scene) {
        return;
      }

      await Share.share({
        message: [
          caption.trim(),

          sceneShareText(
            scene,
          ),
        ]
          .filter(Boolean)
          .join("\n\n"),
      });
    };

  const publish =
    async (
      refreshBeforePublish = false,
    ): Promise<void> => {
      const analyticsAttempt =
        refreshBeforePublish
          ? "retry" as const
          : "initial" as const;

      if (
        !scene ||
        published ||
        publishInFlight.current
      ) {
        return;
      }

      publishInFlight.current =
        true;
      setIsPublishing(true);

      try {
        if (
          refreshBeforePublish
        ) {
          const nextStatus =
            await refreshConnectivity();

          if (
            nextStatus ===
            "offline"
          ) {
            void recordAnalyticsFailure(
              "snapshot_publish",
              "offline",
              analyticsAttempt,
            );

            return;
          }
        }

        setPublishErrorCause(
          null,
        );

        const result =
          pendingSnapshotId
            ? await syncSnapshotWithStatus(
                pendingSnapshotId,
              )
            : await createSnapshotWithStatus({
                sceneId:
                  scene.id,

                sceneName:
                  scene.name,

                note:
                  caption.trim(),

                mood:
                  scene.emotions ||
                  `${scene.energy} energy`,

                visibility:
                  "public",
              });

        if (!result.value) {
          void recordAnalyticsFailure(
            "snapshot_publish",
            "service",
            analyticsAttempt,
          );

          setPublishErrorCause(
            new Error(
              result.warning ||
              "The pending Snapshot could not be found. Try posting again.",
            ),
          );

          setPendingSnapshotId("");

          return;
        }

        if (
          result.cloudStatus !==
          "synced"
        ) {
          void recordAnalyticsFailure(
            "snapshot_publish",
            connectivityStatus ===
              "offline"
              ? "offline"
              : "service",
            analyticsAttempt,
          );

          setPendingSnapshotId(
            result.value.id,
          );

          setPublishErrorCause(
            new Error(
              result.warning ||
              "The Snapshot is saved on this device, but it has not been published to Canal.",
            ),
          );

          return;
        }

        setPendingSnapshotId("");
        setPublished(true);
        setPublishErrorCause(
          null,
        );

        void recordAnalyticsEvent({
          name:
            "snapshot_published",
          attempt:
            analyticsAttempt,
        });

        /*
         * Keep the existing local Activity card as an
         * offline convenience. Cloud publication above
         * is the source of truth for success.
         */
        try {
          await publishToLocalActivity({
            sceneId:
              scene.id,

            sceneName:
              scene.name,

            activity:
              scene.activity,

            mood:
              scene.emotions ||
              `${scene.energy} energy`,

            caption:
              caption.trim(),

            trackCount:
              scene.tracks.length,

            artists:
              scene.artists ||
              scene.tracks
                .slice(0, 4)
                .map(
                  (track) =>
                    track.artist,
                )
                .join(", "),
          });
        } catch (error) {
          console.warn(
            "Snapshot published, but the local Activity card could not be updated:",
            error,
          );
        }
      } catch (error) {
        void recordAnalyticsFailure(
          "snapshot_publish",
          classifyAnalyticsFailure(
            error,
          ),
          analyticsAttempt,
        );

        const publishFailure =
          error ??
          new Error(
            "Canal could not publish this Snapshot.",
          );

        setPublishErrorCause(
          () =>
            publishFailure,
        );
      } finally {
        publishInFlight.current =
          false;

        setIsPublishing(false);
      }
    };

  const sceneLoadIssue =
    sceneLoadError
      ? classifyRecoveryIssue(
          sceneLoadError,
          {
            service:
              "canal",
          },
        )
      : null;

  const publishIssue =
    publishErrorCause
      ? classifyRecoveryIssue(
          publishErrorCause,
          {
            service:
              "canal",
            connectivityStatus,
          },
        )
      : null;

  const recoverPublish =
    async (): Promise<void> => {
      if (
        publishIssue?.action ===
        "sign-in"
      ) {
        router.push(
          "/login" as never,
        );

        return;
      }

      await publish(
        true,
      );
    };

  if (isLoadingScene) {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <View
          style={
            styles.center
          }
        >
          <ActivityIndicator
            size="large"
            color="#F47A24"
          />
        </View>
      </SafeAreaView>
    );
  }

  if (sceneLoadIssue) {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <View
          style={styles.center}
        >
          <View
            style={
              styles.recovery
            }
          >
            <RecoveryNotice
              issue={
                sceneLoadIssue
              }
              onAction={
                loadScene
              }
            />
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={
              closeSceneSnapshot
            }
            style={({ pressed }) => [
              styles.stateButton,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.stateButtonText
              }
            >
              Return to Library
            </Text>
          </Pressable>
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
          style={styles.center}
        >
          <Text
            style={
              styles.stateTitle
            }
          >
            Scene not found
          </Text>

          <Text
            selectable
            style={
              styles.stateText
            }
          >
            It may have been removed from
            your library.
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={
              closeSceneSnapshot
            }
            style={({ pressed }) => [
              styles.stateButton,
              pressed &&
                styles.pressed,
            ]}
          >
            <Text
              style={
                styles.stateButtonText
              }
            >
              Return to Library
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
          onPress={
            closeSceneSnapshot
          }
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

        <Text
          style={
            styles.headerTitle
          }
        >
          Scene Snapshot
        </Text>

        <View style={{ width: 42 }} />
      </View>

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.snapshot}>
          <View style={styles.waveOne} />
          <View style={styles.waveTwo} />
          <View style={styles.waveThree} />

          <Text
            style={
              styles.snapshotBrand
            }
          >
            canal
          </Text>

          <View style={styles.snapshotBottom}>
            <Text
              style={
                styles.snapshotActivity
              }
            >
              {scene.activity}
            </Text>

            <Text
              style={
                styles.snapshotName
              }
            >
              {scene.name}
            </Text>

            <Text
              style={
                styles.snapshotMood
              }
            >
              {scene.emotions ||
                `${scene.energy} energy`}
            </Text>

            <Text
              style={
                styles.snapshotMeta
              }
            >
              {scene.tracks.length} tracks •{" "}
              {sceneDurationMinutes(
                scene,
              )}{" "}
              min
            </Text>

            <Text
              numberOfLines={2}
              style={
                styles.snapshotArtists
              }
            >
              {scene.artists ||
                scene.tracks
                  .slice(0, 5)
                  .map(
                    (track) =>
                      track.artist,
                  )
                  .join(" • ")}
            </Text>
          </View>
        </View>

        <Text style={styles.captionLabel}>
          Caption
        </Text>

        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="Say something about this Scene..."
          placeholderTextColor="#9A938C"
          multiline
          maxLength={280}
          textAlignVertical="top"
          style={styles.captionInput}
        />

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              void share()
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
              Share
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={
              published ||
              isPublishing
            }
            onPress={() =>
              void publish()
            }
            style={({ pressed }) => [
              styles.secondaryButton,

              published &&
                styles.disabled,

              isPublishing &&
                styles.disabled,

              pressed &&
                styles.pressed,
            ]}
          >
            {isPublishing ? (
              <ActivityIndicator
                size="small"
                color="#F47A24"
              />
            ) : (
              <Text
                style={
                  styles.secondaryButtonText
                }
              >
                {published
                  ? "Published"
                  : pendingSnapshotId
                    ? "Retry Post"
                    : "Post to Canal"}
              </Text>
            )}
          </Pressable>
        </View>

        {publishIssue ? (
          <View
            style={
              styles.publishRecovery
            }
          >
            <RecoveryNotice
              busy={
                isPublishing
              }
              issue={
                publishIssue
              }
              onAction={
                recoverPublish
              }
            />
          </View>
        ) : null}

        {published ? (
          <View style={styles.success}>
            <Text
              style={
                styles.successText
              }
            >
              Snapshot published to Canal.
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.replace(
                  "/(tabs)/activity",
                )
              }
              style={
                styles.feedButton
              }
            >
              <Text
                style={
                  styles.feedButtonText
                }
              >
                Open Activity
              </Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.footnote}>
          The system share sheet sends text
          from this MVP. Exporting the visual
          card as an image requires adding a
          native screenshot-sharing module.
        </Text>
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
      gap: 14,
      paddingHorizontal: 20,
    },

    recovery: {
      width: "100%",
      maxWidth: 520,
    },

    stateTitle: {
      color: "#1B1B1B",
      fontSize: 24,
      fontWeight: "900",
      textAlign: "center",
    },

    stateText: {
      color: "#6E6660",
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
    },

    stateButton: {
      minHeight: 48,
      minWidth: 190,
      alignItems: "center",
      justifyContent:
        "center",
      paddingHorizontal: 20,
      borderRadius: 16,
      borderCurve:
        "continuous",
      backgroundColor:
        "#F47A24",
    },

    stateButtonText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "900",
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

    headerTitle: {
      color: "#1B1B1B",
      fontSize: 16,
      fontWeight: "900",
    },

    content: {
      paddingHorizontal: 20,
      paddingBottom: 42,
    },

    snapshot: {
      width: "100%",
      aspectRatio: 0.82,
      maxHeight: 520,
      overflow: "hidden",
      backgroundColor:
        "#2B1710",
      borderRadius: 29,
      padding: 23,
      justifyContent:
        "space-between",
    },

    waveOne: {
      position: "absolute",
      width: 310,
      height: 310,
      borderRadius: 155,
      backgroundColor:
        "#F47A24",
      top: -115,
      right: -90,
      opacity: 0.92,
    },

    waveTwo: {
      position: "absolute",
      width: 250,
      height: 250,
      borderRadius: 125,
      backgroundColor:
        "#8D3C1A",
      bottom: -70,
      left: -85,
      opacity: 0.88,
    },

    waveThree: {
      position: "absolute",
      width: 125,
      height: 125,
      borderRadius: 63,
      backgroundColor:
        "#FFB781",
      top: 150,
      left: 55,
      opacity: 0.7,
    },

    snapshotBrand: {
      color: "#FFFFFF",
      fontSize: 21,
      fontWeight: "900",
      letterSpacing: -0.8,
    },

    snapshotBottom: {
      zIndex: 2,
    },

    snapshotActivity: {
      color: "#FFB781",
      fontSize: 11,
      fontWeight: "900",
      textTransform:
        "uppercase",
      letterSpacing: 1,
    },

    snapshotName: {
      color: "#FFFFFF",
      fontSize: 34,
      lineHeight: 38,
      fontWeight: "900",
      marginTop: 7,
    },

    snapshotMood: {
      color: "#E2CBC0",
      fontSize: 16,
      marginTop: 7,
    },

    snapshotMeta: {
      color: "#BDA89E",
      fontSize: 11,
      marginTop: 19,
    },

    snapshotArtists: {
      color: "#D5BDB2",
      fontSize: 11,
      lineHeight: 17,
      marginTop: 8,
    },

    captionLabel: {
      color: "#5E5752",
      fontSize: 12,
      fontWeight: "800",
      marginTop: 18,
      marginBottom: 7,
    },

    captionInput: {
      minHeight: 94,
      borderWidth: 1,
      borderColor:
        "#E5DDD7",
      backgroundColor:
        "#FFFFFF",
      borderRadius: 17,
      color: "#1B1B1B",
      fontSize: 14,
      padding: 13,
    },

    actions: {
      flexDirection: "row",
      gap: 10,
      marginTop: 14,
    },

    primaryButton: {
      flex: 1,
      minHeight: 51,
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
      fontWeight: "900",
    },

    secondaryButton: {
      flex: 1,
      minHeight: 51,
      borderRadius: 16,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#F47A24",
    },

    secondaryButtonText: {
      color: "#F47A24",
      fontSize: 14,
      fontWeight: "900",
    },

    success: {
      backgroundColor:
        "#EAF9EF",
      borderRadius: 17,
      padding: 14,
      marginTop: 14,
    },

    publishRecovery: {
      marginTop: 14,
    },

    successText: {
      color: "#1D7138",
      fontSize: 12,
      lineHeight: 18,
    },

    feedButton: {
      alignSelf:
        "flex-start",
      paddingVertical: 8,
      paddingRight: 10,
      marginTop: 4,
    },

    feedButtonText: {
      color: "#1D7138",
      fontSize: 12,
      fontWeight: "900",
    },

    footnote: {
      color: "#8A827B",
      fontSize: 10,
      lineHeight: 16,
      textAlign: "center",
      marginTop: 15,
      paddingHorizontal: 8,
    },

    disabled: {
      opacity: 0.45,
    },

    pressed: {
      opacity: 0.7,
    },
  });
