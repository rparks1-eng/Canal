import {
  useCallback,
  useEffect,
  useMemo,
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
import { Image } from "expo-image";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  RecoveryNotice,
} from "../components/recovery-notice";
import { SnapshotMediaPreview } from "../components/snapshot-media-preview";

import {
  useCanalReduceTransparency,
} from "../components/canal-ui";

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
  BUILT_IN_SNAPSHOT_STYLES,
} from "../lib/snapshot-templates";

import type {
  SnapshotTemplateTheme,
} from "../lib/snapshot-templates";

import {
  getSceneById,
  sceneDurationMinutes,
  sceneShareText,
} from "../lib/scenes";

import type {
  SceneTrack,
  StoredScene,
} from "../lib/scenes";
import { readLiveStage } from "../lib/live-stages";
import {
  addSpotifyArtworkToStoredScene,
} from "../lib/spotify-scene-artwork";

import {
  useAuth,
} from "../providers/auth-provider";

import {
  useConnectivity,
} from "../providers/connectivity-provider";

type SnapshotPalette = {
  backgroundColor: string;
  accentColor: string;
  secondaryAccentColor: string;
  textColor: string;
  mutedTextColor: string;
};

type SnapshotFormat =
  | "living-story"
  | "receipt"
  | "ticket";

const SNAPSHOT_FORMATS: readonly {
  key: SnapshotFormat;
  label: string;
  description: string;
}[] = [
  {
    key: "living-story",
    label: "Living Story",
    description: "Editorial Scene card",
  },
  {
    key: "receipt",
    label: "Receipt",
    description: "A tactile listening record",
  },
  {
    key: "ticket",
    label: "Ticket",
    description: "A keepsake for the moment",
  },
];

const CLASSIC_PALETTE: SnapshotPalette = {
  backgroundColor:
    "#2B1710",
  accentColor:
    "#F47A24",
  secondaryAccentColor:
    "#FFB781",
  textColor:
    "#FFFFFF",
  mutedTextColor:
    "#E2CBC0",
};

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
    accountEpoch,
    sessionGeneration,
    user,
  } = useAuth();

  return (
    <SceneSnapshotContent
      key={
        user?.id
          ? `${user.id}:${accountEpoch}:${sessionGeneration ?? "session-pending"}`
          : "signed-out"
      }
    />
  );
}

function SceneSnapshotContent() {
  const reduceTransparency =
    useCanalReduceTransparency();
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
      stageId?: string;
      sceneName?: string;
      source?: string;
      trackId?: string;
      trackTitle?: string;
      trackArtist?: string;
      trackImageUrl?: string;
      spotifyUrl?: string;
      mood?: string;
      mediaUri?: string;
      mediaType?: string;
    }>();

  const mediaUri = typeof params.mediaUri === "string" ? params.mediaUri : "";
  const mediaType = params.mediaType === "video" ? "video" as const : "photo" as const;

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

  const [selectedTrackId, setSelectedTrackId] = useState(
    typeof params.trackId === "string" ? params.trackId : "",
  );

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
    snapshotFormat,
    setSnapshotFormat,
  ] = useState<SnapshotFormat>(
    "living-story",
  );

  const [isSharing, setIsSharing] =
    useState(false);

  const [shareError, setShareError] =
    useState("");

  const shareInFlight =
    useRef(false);

  const [
    selectedTemplateId,
    setSelectedTemplateId,
  ] = useState(
    BUILT_IN_SNAPSHOT_STYLES[0]?.id ?? "",
  );

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
          const storedScene = await getSceneById(sceneId);
          const stage = !storedScene && params.source === "stage" && typeof params.stageId === "string"
            ? await readLiveStage(params.stageId)
            : null;
          const stageName = typeof params.sceneName === "string" ? params.sceneName.trim() : "";
          const routeTrackImageUrl = typeof params.trackImageUrl === "string"
            ? params.trackImageUrl
            : "";
          const sceneWithRouteArtwork = storedScene
            ? {
                ...storedScene,
                tracks: storedScene.tracks.map((track) =>
                  track.id === params.trackId && !track.imageUrl && routeTrackImageUrl
                    ? { ...track, imageUrl: routeTrackImageUrl }
                    : track,
                ),
              }
            : null;
          const artworkReadyScene = sceneWithRouteArtwork
            ? await addSpotifyArtworkToStoredScene(sceneWithRouteArtwork)
            : null;
          const stageScene = stageName ? {
            id: sceneId,
            name: stageName,
            activity: typeof params.source === "string" && params.source === "stage" ? "Live Stage" : "Scene",
            duration: "Live moment",
            emotions: typeof params.mood === "string" ? params.mood : "",
            genres: "",
            energy: "live",
            familiarity: "",
            artists: typeof params.trackArtist === "string" ? params.trackArtist : "",
            songRequest: "",
            avoid: "",
            collaborators: [],
            tracks: stage?.tracks.length ? stage.tracks : typeof params.trackId === "string" && params.trackId ? [{
              id: params.trackId,
              title: typeof params.trackTitle === "string" ? params.trackTitle : "Stage moment",
              artist: typeof params.trackArtist === "string" ? params.trackArtist : "Canal",
              imageUrl: routeTrackImageUrl || undefined,
              spotifyUrl: typeof params.spotifyUrl === "string" ? params.spotifyUrl : undefined,
            }] : [],
            visibility: "private",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            libraryType: "created",
          } satisfies StoredScene : null;
          const nextScene = artworkReadyScene ?? (
            stageScene
              ? await addSpotifyArtworkToStoredScene(stageScene)
              : null
          );
          setScene(nextScene);
          setSelectedTrackId((current) =>
            nextScene?.tracks.some((track) => track.id === current)
              ? current
              : nextScene?.tracks[0]?.id ?? "",
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
        params.stageId,
        params.sceneName,
        params.source,
        params.mood,
        params.trackId,
        params.trackTitle,
        params.trackArtist,
        params.trackImageUrl,
        params.spotifyUrl,
      ],
    );

  useEffect(() => {
    void loadScene();
  }, [
    loadScene,
  ]);

  const selectedTrack = useMemo<SceneTrack | undefined>(
    () => scene?.tracks.find((track) => track.id === selectedTrackId) ?? scene?.tracks[0],
    [scene, selectedTrackId],
  );

  const share =
    async (): Promise<void> => {
      if (!scene || shareInFlight.current) {
        return;
      }

      shareInFlight.current = true;
      setIsSharing(true);
      setShareError("");

      try {
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
      } catch (error) {
        setShareError(
          error instanceof Error
            ? error.message
            : "Canal could not open the share sheet.",
        );
      } finally {
        shareInFlight.current = false;
        setIsSharing(false);
      }
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

                sceneActivity:
                  scene.activity,

                trackId: selectedTrack?.id,
                trackTitle: selectedTrack?.title,
                trackArtist: selectedTrack?.artist,
                trackImageUrl: selectedTrack?.imageUrl,
                spotifyUrl: selectedTrack?.spotifyUrl,
                mediaUri: mediaUri || undefined,
                mediaType: mediaUri ? mediaType : undefined,
                mediaMimeType:
                  mediaUri
                    ? snapshotMediaMimeType(
                        mediaUri,
                        mediaType,
                      )
                    : undefined,

                note:
                  caption.trim(),

                mood:
                  scene.emotions ||
                  `${scene.energy} energy`,

                visibility:
                  "public",

                templateBrandLabel:
                  selectedTemplate?.brandLabel,
                templateTheme:
                  selectedTemplate?.theme,
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

  const selectedTemplate =
    BUILT_IN_SNAPSHOT_STYLES.find(
      (template) =>
        template.id ===
        selectedTemplateId,
    );

  const palette =
    selectedTemplate
      ? templatePalette(
          selectedTemplate.theme,
        )
      : CLASSIC_PALETTE;

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
            accessibilityLabel="Return to Library"
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
            accessibilityLabel="Return to Library"
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
          accessibilityLabel="Return from Snapshot composer"
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
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.snapshot,
            snapshotFormat === "receipt" &&
              styles.receiptSnapshot,
            snapshotFormat === "ticket" &&
              styles.ticketSnapshot,
            {
              backgroundColor:
                palette.backgroundColor,
            },
          ]}
        >
          {mediaUri ? (
            <SnapshotMediaPreview uri={mediaUri} type={mediaType} background />
          ) : null}
          {mediaUri ? <View style={styles.mediaScrim} /> : null}
          {!reduceTransparency && snapshotFormat === "living-story" ? <View
            style={[
              styles.waveOne,
              {
                backgroundColor:
                  palette.accentColor,
              },
            ]}
          /> : null}
          {!reduceTransparency && snapshotFormat === "living-story" ? <View
            style={[
              styles.waveTwo,
              {
                backgroundColor:
                  palette.accentColor,
              },
            ]}
          /> : null}
          {!reduceTransparency && snapshotFormat === "living-story" ? <View
            style={[
              styles.waveThree,
              {
                backgroundColor:
                  palette.secondaryAccentColor,
              },
            ]}
          /> : null}

          <Text
            style={[
              styles.snapshotBrand,
              {
                color:
                  palette.textColor,
              },
            ]}
          >
            {selectedTemplate
              ?.brandLabel ||
              "canal"}
          </Text>

          <View style={styles.snapshotBottom}>
            <Text
              style={[
                styles.snapshotActivity,
                {
                  color:
                    palette.secondaryAccentColor,
                },
              ]}
            >
              {scene.activity}
            </Text>

            <Text
              style={[
                styles.snapshotName,
                {
                  color:
                    palette.textColor,
                },
              ]}
            >
              {scene.name}
            </Text>

            <Text
              style={[
                styles.snapshotMood,
                {
                  color:
                    palette.mutedTextColor,
                },
              ]}
            >
              {scene.emotions ||
                `${scene.energy} energy`}
            </Text>

            {selectedTrack ? (
              <View style={styles.snapshotTrack}>
                {selectedTrack.imageUrl ? (
                  <Image
                    accessibilityLabel={`${selectedTrack.title} artwork`}
                    source={{ uri: selectedTrack.imageUrl }}
                    style={styles.snapshotTrackArtwork}
                    contentFit="cover"
                    transition={160}
                  />
                ) : (
                  <View style={styles.snapshotTrackArtworkFallback}>
                    <Text style={styles.snapshotTrackArtworkNote}>♪</Text>
                  </View>
                )}
                <View style={styles.snapshotTrackCopy}>
                  <Text numberOfLines={1} style={[styles.snapshotTrackTitle, { color: palette.textColor }]}>
                    {selectedTrack.title}
                  </Text>
                  <Text numberOfLines={1} style={[styles.snapshotTrackArtist, { color: palette.mutedTextColor }]}>
                    {selectedTrack.artist}
                  </Text>
                </View>
              </View>
            ) : null}

            <Text
              style={[
                styles.snapshotMeta,
                {
                  color:
                    palette.mutedTextColor,
                },
              ]}
            >
              {scene.tracks.length} tracks •{" "}
              {sceneDurationMinutes(
                scene,
              )}{" "}
              min
            </Text>

            <Text
              numberOfLines={2}
              style={[
                styles.snapshotArtists,
                {
                  color:
                    palette.mutedTextColor,
                },
              ]}
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

        {mediaUri && scene.tracks.length > 0 ? (
          <View style={styles.songPickerSection}>
            <Text accessibilityRole="header" style={styles.formatTitle}>Snapshot song</Text>
            <Text style={styles.formatDescription}>
              Choose any song from this {params.source === "stage" ? "Stage" : "Scene"}. The selected song and artwork will be saved with the Snapshot.
            </Text>
            <ScrollView
              horizontal
              accessibilityRole="radiogroup"
              contentContainerStyle={styles.songChoices}
              showsHorizontalScrollIndicator={false}
            >
              {scene.tracks.map((track) => {
                const selected = track.id === selectedTrack?.id;
                return (
                  <Pressable
                    key={track.id}
                    accessibilityLabel={`Use ${track.title} by ${track.artist} in Snapshot`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => setSelectedTrackId(track.id)}
                    style={({ pressed }) => [
                      styles.songChoice,
                      selected && styles.songChoiceSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    {track.imageUrl ? (
                      <Image source={{ uri: track.imageUrl }} style={styles.songChoiceArtwork} contentFit="cover" />
                    ) : (
                      <View style={[styles.songChoiceArtwork, styles.songChoiceArtworkFallback]}>
                        <Text style={styles.songChoiceNote}>♪</Text>
                      </View>
                    )}
                    <View style={styles.songChoiceCopy}>
                      <Text numberOfLines={1} style={styles.songChoiceTitle}>{track.title}</Text>
                      <Text numberOfLines={1} style={styles.songChoiceArtist}>{track.artist}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.formatSection}>
          <Text accessibilityRole="header" style={styles.formatTitle}>
            Story format
          </Text>
          <Text style={styles.formatDescription}>
            Living Story is the default. Receipt and Ticket keep the same Scene data in a tactile layout.
          </Text>
          <View accessibilityRole="radiogroup" style={styles.formatChoices}>
            {SNAPSHOT_FORMATS.map((format) => (
              <Pressable
                key={format.key}
                accessibilityLabel={`${format.label} Snapshot format`}
                accessibilityHint={format.description}
                accessibilityRole="radio"
                accessibilityState={{ checked: snapshotFormat === format.key }}
                onPress={() => setSnapshotFormat(format.key)}
                style={({ pressed }) => [
                  styles.formatChoice,
                  snapshotFormat === format.key && styles.formatChoiceSelected,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.formatChoiceLabel}>
                  {snapshotFormat === format.key ? "✓ " : ""}{format.label}
                </Text>
                <Text style={styles.formatChoiceDescription}>{format.description}</Text>
              </Pressable>
            ))}
            <View
              accessibilityLabel="Signal Film Snapshot format unavailable"
              accessibilityRole="text"
              style={[styles.formatChoice, styles.formatChoiceUnavailable]}
            >
              <Text style={styles.formatChoiceLabel}>Signal Film</Text>
              <Text style={styles.formatChoiceDescription}>
                Available only when a future user-owned or Canal-generated media route is approved. Spotify artwork is never transformed.
              </Text>
            </View>
          </View>
        </View>

        <View
          style={
            styles.templateHeader
          }
        >
          <View
            style={
              styles.templateHeaderCopy
            }
          >
            <Text
              style={
                styles.templateLabel
              }
            >
              Snapshot style
            </Text>

            <Text
              style={
                styles.templateDescription
              }
            >
              Pick an accessible look for this post.
            </Text>
          </View>

        </View>

        <ScrollView
          horizontal
          accessibilityRole="radiogroup"
          contentContainerStyle={
            styles.templateChoices
          }
          showsHorizontalScrollIndicator={
            false
          }
        >
            {BUILT_IN_SNAPSHOT_STYLES.map(
              (template) => (
                <TemplateChoice
                  key={
                    template.id
                  }
                  brandLabel={
                    template.brandLabel
                  }
                  label={
                    template.name
                  }
                  palette={templatePalette(
                    template.theme,
                  )}
                  selected={
                    template.id ===
                    selectedTemplateId
                  }
                  onPress={() =>
                    setSelectedTemplateId(
                      template.id,
                    )
                  }
                />
              ),
            )}
        </ScrollView>

        <Text style={styles.captionLabel}>
          Caption
        </Text>

        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="Say something about this Scene..."
          placeholderTextColor={canalDynamicColors.muted}
          multiline
          maxLength={280}
          textAlignVertical="top"
          style={styles.captionInput}
        />

        <View style={styles.actions}>
          <Pressable
            accessibilityLabel="Share Snapshot"
            accessibilityRole="button"
            accessibilityState={{
              busy: isSharing,
              disabled: isSharing,
            }}
            disabled={isSharing}
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
              {isSharing ? "Opening Share Sheet" : "Share"}
            </Text>
          </Pressable>

          <Pressable
            accessibilityLabel={pendingSnapshotId ? "Retry Post" : "Post Snapshot to Canal"}
            accessibilityRole="button"
            accessibilityState={{
              busy: isPublishing,
              disabled: published || isPublishing,
            }}
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

        {shareError ? (
          <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.shareError}>
            <Text selectable style={styles.shareErrorText}>{shareError}</Text>
            <Pressable
              accessibilityLabel="Retry Share"
              accessibilityRole="button"
              accessibilityState={{ busy: isSharing, disabled: isSharing }}
              disabled={isSharing}
              onPress={() => void share()}
              style={styles.retryShareButton}
            >
              <Text style={styles.retryShareText}>Retry Share</Text>
            </Pressable>
          </View>
        ) : null}

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

function snapshotMediaMimeType(
  mediaUri: string,
  mediaType: "photo" | "video",
): string {
  const normalizedUri =
    mediaUri
      .split(/[?#]/u)[0]
      .toLowerCase();

  if (mediaType === "video") {
    return normalizedUri.endsWith(".mov")
      ? "video/quicktime"
      : "video/mp4";
  }

  if (
    normalizedUri.endsWith(".heic") ||
    normalizedUri.endsWith(".heif")
  ) {
    return "image/heic";
  }

  return normalizedUri.endsWith(".png")
    ? "image/png"
    : "image/jpeg";
}

function TemplateChoice(
  props: {
    label: string;
    brandLabel: string;
    palette: SnapshotPalette;
    selected: boolean;
    onPress: () => void;
  },
) {
  return (
    <Pressable
      accessibilityLabel={`${props.label} Snapshot style`}
      accessibilityRole="radio"
      accessibilityState={{
        checked:
          props.selected,
      }}
      onPress={
        props.onPress
      }
      style={({
        pressed,
      }) => [
        styles.templateChoice,
        props.selected &&
          styles.selectedTemplateChoice,
        pressed &&
          styles.pressed,
      ]}
    >
      <View
        style={[
          styles.templateChoiceSwatch,
          {
            backgroundColor:
              props.palette
                .backgroundColor,
          },
        ]}
      >
        <View
          style={[
            styles.templateChoiceAccent,
            {
              backgroundColor:
                props.palette
                  .accentColor,
            },
          ]}
        />

        <Text
          numberOfLines={1}
          style={[
            styles.templateChoiceBrand,
            {
              color:
                props.palette
                  .textColor,
            },
          ]}
        >
          {props.brandLabel}
        </Text>
      </View>

      <Text
        numberOfLines={1}
        style={[
          styles.templateChoiceLabel,
          props.selected &&
            styles.selectedTemplateChoiceLabel,
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

function templatePalette(
  theme: SnapshotTemplateTheme,
): SnapshotPalette {
  switch (theme) {
    case "midnight":
      return {
        backgroundColor:
          "#101B34",
        accentColor:
          "#79A7FF",
        secondaryAccentColor:
          "#B9D0FF",
        textColor:
          "#F6F8FF",
        mutedTextColor:
          "#D0DAEF",
      };

    case "paper":
      return {
        backgroundColor:
          "#FFF4E8",
        accentColor:
          "#C64B2D",
        secondaryAccentColor:
          "#E89C76",
        textColor:
          "#2B2520",
        mutedTextColor:
          "#66584E",
      };

    case "sunset":
    default:
      return {
        backgroundColor:
          "#3E1734",
        accentColor:
          "#FF9A50",
        secondaryAccentColor:
          "#FFD0A8",
        textColor:
          "#FFF8F2",
        mutedTextColor:
          "#F2D9E7",
      };
  }
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: canalDynamicColors.baseCanvas,
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
      color: canalDynamicColors.text,
      fontSize: 24,
      fontWeight: "900",
      textAlign: "center",
    },

    stateText: {
      color: canalDynamicColors.muted,
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
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor: canalDynamicColors.surface,
    },

    backText: {
      color: canalDynamicColors.text,
      fontSize: 34,
      lineHeight: 36,
      marginTop: -2,
    },

    headerTitle: {
      color: canalDynamicColors.text,
      fontFamily: "Georgia",
      fontSize: 22,
      fontWeight: "400",
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

    mediaScrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(5, 8, 12, 0.48)",
    },

    receiptSnapshot: {
      aspectRatio: 0.72,
      borderRadius: 10,
      borderWidth: 2,
      borderStyle: "dashed",
      borderColor: "rgba(255,255,255,0.55)",
    },

    ticketSnapshot: {
      aspectRatio: 1.58,
      maxHeight: 360,
      borderRadius: 18,
      borderWidth: 2,
      borderColor: "rgba(255,255,255,0.5)",
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

    snapshotTrack: {
      minHeight: 58,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 18,
      borderRadius: 15,
      borderCurve: "continuous",
      backgroundColor: "rgba(5,8,12,0.62)",
      padding: 8,
    },

    snapshotTrackArtwork: {
      width: 42,
      height: 42,
      borderRadius: 9,
    },

    snapshotTrackArtworkFallback: {
      width: 42,
      height: 42,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.16)",
    },

    snapshotTrackArtworkNote: {
      color: "#FFFFFF",
      fontSize: 18,
    },

    snapshotTrackCopy: {
      flex: 1,
      minWidth: 0,
    },

    snapshotTrackTitle: {
      fontSize: 13,
      fontWeight: "900",
    },

    snapshotTrackArtist: {
      fontSize: 11,
      marginTop: 3,
    },

    snapshotActivity: {
      color: canalDynamicColors.gold,
      fontSize: 11,
      fontWeight: "900",
      textTransform:
        "uppercase",
      letterSpacing: 1,
    },

    snapshotName: {
      color: canalDynamicColors.text,
      fontFamily: "Georgia",
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
      color: canalDynamicColors.muted,
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
      color: canalDynamicColors.muted,
      fontSize: 12,
      fontWeight: "800",
      marginTop: 18,
      marginBottom: 7,
    },

    formatSection: {
      gap: 6,
      marginTop: 20,
    },

    songPickerSection: {
      gap: 6,
      marginTop: 20,
    },

    songChoices: {
      gap: 10,
      paddingTop: 8,
      paddingRight: 20,
    },

    songChoice: {
      width: 230,
      minHeight: 66,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: "rgba(25,26,24,0.14)",
      borderRadius: 16,
      borderCurve: "continuous",
      backgroundColor: canalDynamicColors.surface,
      padding: 8,
    },

    songChoiceSelected: {
      borderColor: canalDynamicColors.mint,
      borderWidth: 2,
    },

    songChoiceArtwork: {
      width: 48,
      height: 48,
      borderRadius: 11,
    },

    songChoiceArtworkFallback: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: canalDynamicColors.elevated,
    },

    songChoiceNote: {
      color: canalDynamicColors.mint,
      fontSize: 18,
    },

    songChoiceCopy: {
      flex: 1,
      minWidth: 0,
    },

    songChoiceTitle: {
      color: canalDynamicColors.text,
      fontSize: 13,
      fontWeight: "900",
    },

    songChoiceArtist: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      marginTop: 3,
    },

    formatTitle: {
      color: canalDynamicColors.text,
      fontFamily: "Georgia",
      fontSize: 24,
      lineHeight: 29,
    },

    formatDescription: {
      color: canalDynamicColors.muted,
      fontSize: 14,
      lineHeight: 21,
    },

    formatChoices: {
      gap: 10,
      marginTop: 6,
    },

    formatChoice: {
      minHeight: 64,
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(25,26,24,0.14)",
      borderRadius: 16,
      backgroundColor: canalDynamicColors.surface,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },

    formatChoiceSelected: {
      borderColor: "#4C46C8",
      borderWidth: 2,
    },

    formatChoiceUnavailable: {
      opacity: 0.68,
    },

    formatChoiceLabel: {
      color: canalDynamicColors.text,
      fontSize: 15,
      fontWeight: "800",
    },

    formatChoiceDescription: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 2,
    },

    templateHeader: {
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 14,
      marginTop: 18,
    },

    templateHeaderCopy: {
      flex: 1,
      gap: 2,
    },

    templateLabel: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      fontWeight: "900",
    },

    templateDescription: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      lineHeight: 16,
    },

    manageTemplatesButton: {
      minHeight: 48,
      justifyContent:
        "center",
      paddingHorizontal: 8,
    },

    manageTemplatesText: {
      color: canalDynamicColors.gold,
      fontSize: 12,
      fontWeight: "900",
    },

    templateLoader: {
      marginVertical: 18,
    },

    templateChoices: {
      gap: 10,
      paddingVertical: 10,
      paddingRight: 20,
    },

    templateChoice: {
      width: 116,
      minHeight: 96,
      gap: 7,
      borderWidth: 1,
      borderColor:
        "#E5DDD7",
      borderRadius: 16,
      borderCurve:
        "continuous",
      backgroundColor: canalDynamicColors.surface,
      padding: 8,
    },

    selectedTemplateChoice: {
      borderColor:
        "#F47A24",
      backgroundColor:
        "#FFF4EA",
    },

    templateChoiceSwatch: {
      height: 64,
      justifyContent:
        "space-between",
      borderRadius: 11,
      borderCurve:
        "continuous",
      overflow: "hidden",
      padding: 8,
    },

    templateChoiceAccent: {
      width: 34,
      height: 7,
      borderRadius: 4,
    },

    templateChoiceBrand: {
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.5,
    },

    templateChoiceLabel: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      fontWeight: "800",
    },

    selectedTemplateChoiceLabel: {
      color: canalDynamicColors.gold,
    },

    templateWarning: {
      color: "#8B4D22",
      fontSize: 11,
      lineHeight: 16,
      marginBottom: 4,
    },

    captionInput: {
      minHeight: 94,
      borderWidth: 1,
      borderColor:
        "#E5DDD7",
      backgroundColor: canalDynamicColors.surface,
      borderRadius: 17,
      color: canalDynamicColors.text,
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
      backgroundColor: canalDynamicColors.surface,
      borderWidth: 1,
      borderColor:
        "#F47A24",
    },

    secondaryButtonText: {
      color: canalDynamicColors.gold,
      fontSize: 14,
      fontWeight: "900",
    },

    success: {
      backgroundColor: canalDynamicColors.successSurface,
      borderRadius: 17,
      padding: 14,
      marginTop: 14,
    },

    publishRecovery: {
      marginTop: 14,
    },

    shareError: {
      gap: 8,
      marginTop: 14,
      borderRadius: 16,
      backgroundColor: canalDynamicColors.dangerSurface,
      padding: 14,
    },

    shareErrorText: {
      color: "#8D211C",
      fontSize: 13,
      lineHeight: 19,
    },

    retryShareButton: {
      minHeight: 48,
      alignSelf: "flex-start",
      justifyContent: "center",
      paddingHorizontal: 14,
    },

    retryShareText: {
      color: "#8D211C",
      fontSize: 13,
      fontWeight: "900",
    },

    successText: {
      color: "#1D7138",
      fontSize: 12,
      lineHeight: 18,
    },

    feedButton: {
      alignSelf:
        "flex-start",
      minHeight: 48,
      justifyContent: "center",
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
import { canalDynamicColors } from "../theme/canal-dynamic-colors";
