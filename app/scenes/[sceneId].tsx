import { canalDynamicColors } from "../../theme/canal-dynamic-colors";
import {
  use,
  useCallback,
  useEffect,
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
import Animated, {
  Easing,
  FadeInRight,
  FadeOutRight,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

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
  toggleSceneFavorite,
} from "../../lib/scenes";
import { shareScene } from "../../lib/canal-share";
import { getOrCreatePublicSceneShareId, getPublicSceneLinkPreview, type PublicLinkPreview } from "../../lib/public-link-previews";
import { PublicPreviewActions, PublicPreviewState } from "../../components/public-preview";

import {
  syncScenesWithCloud,
} from "../../lib/scene-sync";
import {
  recordStoredSceneRecommendationFeedback,
} from "../../lib/scene-recommendation-feedback";
import {
  captureSceneStudioScope,
} from "../../lib/scene-studio-scope";

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
import { SceneCardBackdrop } from "../../components/canal-ui/scene-card-visual";
import { SceneDnaPanel } from "../../components/canal-ui/scene-dna-panel";

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

const PUBLIC_SHARE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export default function SceneDetailScreen() {
  const params = useLocalSearchParams<{ sceneId?: string }>();
  const sceneId = typeof params.sceneId === "string" ? params.sceneId : "";
  if (PUBLIC_SHARE_ID_PATTERN.test(sceneId)) {
    return <SceneUuidRoute sceneId={sceneId} />;
  }
  return <SceneDetailContent />;
}

function SceneUuidRoute({ sceneId }: { sceneId: string }) {
  const { user } = useAuth();
  const [internalScene, setInternalScene] = useState<boolean | null>(user ? null : false);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!user) {
      setInternalScene(false);
      return () => { active = false; };
    }
    setInternalScene(null);
    void getSceneById(sceneId)
      .then((value) => { if (active) setInternalScene(Boolean(value)); })
      .catch(() => { if (active) setInternalScene(false); });
    return () => { active = false; };
  }, [sceneId, user]));

  if (internalScene === null) {
    return <SafeAreaView style={publicSceneStyles.safe}><PublicPreviewState status="loading" /></SafeAreaView>;
  }
  return internalScene ? <SceneDetailContent /> : <PublicScenePreview publicShareId={sceneId} />;
}

function PublicScenePreview({ publicShareId }: { publicShareId: string }) {
  const { user } = useAuth();
  const [preview, setPreview] = useState<PublicLinkPreview | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let active = true;
    void getPublicSceneLinkPreview(publicShareId)
      .then((value) => { if (active) setPreview(value); })
      .catch(() => { if (active) setPreview(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [publicShareId]));

  if (loading) return <SafeAreaView style={publicSceneStyles.safe}><PublicPreviewState status="loading" /></SafeAreaView>;
  if (!preview) return <SafeAreaView style={publicSceneStyles.safe}><PublicPreviewState status="not-found" /></SafeAreaView>;

  const title = typeof preview.title === "string" ? preview.title : "Public Scene";
  const activity = typeof preview.activity === "string" ? preview.activity : "Listening";
  const creator = typeof preview.ownerDisplayName === "string" ? preview.ownerDisplayName : "Canal listener";
  return (
    <SafeAreaView style={publicSceneStyles.safe}>
      <View style={publicSceneStyles.content}>
        <Text style={publicSceneStyles.eyebrow}>PUBLIC SCENE</Text>
        <Text accessibilityRole="header" style={publicSceneStyles.title}>{title}</Text>
        <Text style={publicSceneStyles.body}>{activity} · by {creator}</Text>
        <PublicPreviewActions destination={`/scenes/${publicShareId}`} signedIn={Boolean(user)} primaryLabel="Create a Scene like this" onPrimary={() => router.push("/scene-studio")} />
      </View>
    </SafeAreaView>
  );
}

const publicSceneStyles = StyleSheet.create({
  safe: { backgroundColor: "#0A2030", flex: 1 },
  content: { flex: 1, gap: 14, justifyContent: "center", padding: 28 },
  eyebrow: { color: "#72D8C4", fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: canalDynamicColors.text, fontFamily: "Georgia", fontSize: 38, fontWeight: "700" },
  body: { color: canalDynamicColors.muted, fontSize: 15, lineHeight: 22, marginBottom: 8 },
});

function SceneDetailContent() {
  const {
    setOverride,
  } = use(CanalAtmosphereContext);
  const reduceTransparency = useCanalReduceTransparency();
  const reduceMotion = useReducedMotion();
  const {
    accountEpoch,
    sessionGeneration,
    user,
  } =
    useAuth();
  const authScope = useMemo(
    () => captureSceneStudioScope({
      userId: user?.id,
      accountEpoch,
      sessionGeneration,
    }),
    [accountEpoch, sessionGeneration, user?.id],
  );
  const currentAuthScopeRef = useRef(authScope);
  currentAuthScopeRef.current = authScope;
  const currentAuthScope = useCallback(
    () => currentAuthScopeRef.current,
    [],
  );

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
  const [profileVisible, setProfileVisible] = useState(false);
  const [heroActionsVisible, setHeroActionsVisible] = useState(false);
  const profileProgress = useSharedValue(0);
  const profileAnimatedStyle = useAnimatedStyle(() => ({
    marginTop: 15 * profileProgress.value,
    maxHeight: 250 * profileProgress.value,
    opacity: profileProgress.value,
    transform: [{ translateY: 10 * (1 - profileProgress.value) }],
  }));

  useEffect(() => {
    profileProgress.value = withTiming(profileVisible ? 1 : 0, {
      duration: reduceMotion ? 0 : 460,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
  }, [profileProgress, profileVisible, reduceMotion]);

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
      const feedbackScope = currentAuthScope();
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
        if (feedbackScope) {
          void recordStoredSceneRecommendationFeedback({
            scope: feedbackScope,
            currentScope: currentAuthScope,
            scene: updated,
            action: updated.favorite ? "favorite" : "unfavorite",
          });
        }
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

      const publicShareId = scene.visibility === "public"
        ? await getOrCreatePublicSceneShareId(scene.id)
        : scene.id;
      await shareScene({
        id: publicShareId,
        name: scene.name,
        activity: scene.activity,
        duration: scene.duration,
        emotions: scene.emotions,
        genres: scene.genres,
        energy: scene.energy,
        artists: scene.artists,
        visibility: scene.visibility,
        tracks: scene.tracks.map((track) => ({
          title: track.title,
          artist: track.artist,
          spotifyUrl: canonicalSpotifyTrackUrl(track.spotifyUrl, track.spotifyUri) ?? undefined,
        })),
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
      onTouchEnd={() => {
        if (heroActionsVisible) setHeroActionsVisible(false);
      }}
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

        <View style={styles.pageMenuArea}>
          {heroActionsVisible ? (
            <Animated.View
              accessibilityLabel="Scene actions"
              accessibilityRole="menu"
              entering={FadeInRight.duration(160)}
              exiting={FadeOutRight.duration(120)}
              onTouchStart={(event) => event.stopPropagation()}
              onTouchEnd={(event) => event.stopPropagation()}
              style={styles.pageActionLedgeMotion}
            >
              <View style={styles.heroActionLedge}>
                <Pressable
                  accessibilityLabel="Share Scene"
                  accessibilityRole="button"
                  onPress={() => {
                    setHeroActionsVisible(false);
                    void share();
                  }}
                  style={styles.heroLedgeAction}
                >
                  <Ionicons color={canalDynamicColors.text} name="share-outline" size={18} />
                </Pressable>
                <Pressable
                  accessibilityLabel="Delete Scene"
                  accessibilityRole="button"
                  onPress={() => {
                    setHeroActionsVisible(false);
                    confirmDelete();
                  }}
                  style={styles.heroLedgeAction}
                >
                  <Ionicons color={canalDynamicColors.danger} name="trash-outline" size={18} />
                </Pressable>
              </View>
            </Animated.View>
          ) : null}
          <Pressable
            accessibilityLabel="Manage Scene"
            accessibilityRole="button"
            accessibilityState={{ expanded: heroActionsVisible }}
            onTouchStart={(event) => event.stopPropagation()}
            onTouchEnd={(event) => event.stopPropagation()}
            onPress={() => setHeroActionsVisible((current) => !current)}
            style={({ pressed }) => [styles.pageMenuButton, pressed && styles.pressed]}
          >
            <Ionicons color={presentation.accent} name="ellipsis-vertical" size={19} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
        onScrollBeginDrag={() => setHeroActionsVisible(false)}
      >
        <View style={[
          styles.hero,
          reduceTransparency
            ? styles.solidSurface
            : styles.heroGlass,
        ]}>
          <SceneCardBackdrop presentation={presentation} scene={scene} />
          <Pressable
            accessibilityLabel={scene.favorite ? "Remove Scene from favorites" : "Add Scene to favorites"}
            accessibilityRole="button"
            accessibilityState={{ busy: favoriteBusy, selected: scene.favorite }}
            disabled={favoriteBusy}
            onPress={() => void favorite()}
            style={({ pressed }) => [styles.heroFavorite, pressed && styles.pressed]}
          >
            <Ionicons
              color={scene.favorite ? presentation.accent : canalDynamicColors.text}
              name={scene.favorite ? "star" : "star-outline"}
              size={21}
            />
          </Pressable>
          <Pressable
            accessibilityLabel="Duplicate Scene"
            accessibilityRole="button"
            onPress={() => void duplicate()}
            style={({ pressed }) => [styles.heroDuplicate, pressed && styles.pressed]}
          >
            <Ionicons color={presentation.accent} name="copy-outline" size={20} />
          </Pressable>
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

          <SceneDnaPanel accent={presentation.accent} scene={scene} />

          <View style={styles.primaryActionRow}>
            <Pressable
              accessibilityLabel="Start Scene"
              accessibilityRole="button"
              onPress={() => void start()}
              style={({ pressed }) => [
                styles.startButton,
                { backgroundColor: presentation.accent },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.startButtonText, { color: presentation.accentText }]}>Start Scene</Text>
            </Pressable>
            {scene.libraryType === "created" && user?.id ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Start a live Stage with ${scene.name}`}
                accessibilityHint="Opens Stage creation with this Scene selected"
                onPress={() => router.push({ pathname: "/create-stage", params: { sceneId: scene.id } } as never)}
                style={({ pressed }) => [
                  styles.stageStartButton,
                  { backgroundColor: presentation.accent },
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons color={presentation.accentText} name="radio-outline" size={22} />
              </Pressable>
            ) : null}
          </View>

          <Animated.View
            accessibilityElementsHidden={!profileVisible}
            accessibilityLabel="Scene profile details"
            importantForAccessibility={profileVisible ? "auto" : "no-hide-descendants"}
            pointerEvents={profileVisible ? "auto" : "none"}
            style={[styles.heroProfile, profileAnimatedStyle]}
          >
              {[
                ["Genres", scene.genres || "Spotify taste"],
                ["Artists", scene.artists || "Multiple artists"],
                ["Energy", scene.energy],
                ["Familiarity", scene.familiarity],
                ["Visibility", scene.visibility],
              ].map(([label, value]) => (
                <View key={label} style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{label}</Text>
                  <Text style={styles.detailValue}>{value}</Text>
                </View>
              ))}
          </Animated.View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={profileVisible ? "Hide Scene profile" : "Show Scene profile"}
            accessibilityState={{ expanded: profileVisible }}
            onPress={() => setProfileVisible((current) => !current)}
            style={({ pressed }) => [styles.profileToggle, pressed && styles.pressed]}
          >
            <Text style={[styles.profileToggleText, { color: presentation.accent }]}>
              {profileVisible ? "Hide Scene profile" : "Show Scene profile"}
            </Text>
            <Ionicons
              color={presentation.accent}
              name={profileVisible ? "chevron-up" : "chevron-down"}
              size={17}
            />
          </Pressable>
        </View>

        <View style={styles.actionGrid}>
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
          styles.trackSequence,
          {
            backgroundColor: `${presentation.colors[2]}38`,
          },
        ]}>
          <View style={styles.sequenceHeader}>
            <Text style={styles.sectionTitle}>Track sequence</Text>
            <Text style={[styles.sequenceCount, { color: presentation.accent }]}>
              {scene.tracks.length} tracks
            </Text>
          </View>

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
                  accessibilityLabel={`View song context for ${track.title}`}
                  accessibilityHint="Opens the Canal song page with context from Genius"
                  onPress={() => router.push({
                    pathname: "/song-context",
                    params: { sceneId: scene.id, trackId: track.id },
                  } as never)}
                  style={({ pressed }) => [
                    styles.trackRow,
                    index === 0 && [
                      styles.trackRowFirst,
                      { backgroundColor: `${presentation.accent}0D` },
                    ],

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
                    {index === 0 ? (
                      <Text style={[styles.trackKicker, { color: presentation.accent }]}>FIRST UP</Text>
                    ) : null}
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

                  <Ionicons color={index === 0 ? presentation.accent : canalDynamicColors.muted} name="information-circle-outline" size={20} />
                </Pressable>
              ),
            )
          )}
        </View>

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

    pageMenuArea: {
      position: "relative",
      width: 48,
      height: 48,
      zIndex: 20,
    },

    pageMenuButton: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
    },

    pageActionLedgeMotion: {
      position: "absolute",
      zIndex: 21,
      top: 0,
      right: 48,
    },

    content: {
      paddingHorizontal: 20,
      paddingBottom: 110,
      gap: 15,
    },

    hero: {
      alignItems: "center",
      borderRadius: 27,
      overflow: "hidden",
      paddingHorizontal: 20,
      paddingVertical: 27,
    },

    heroGlass: {
      backgroundColor: "rgba(5,42,66,0.58)",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(220,255,249,0.22)",
    },

    heroFavorite: {
      position: "absolute",
      zIndex: 5,
      top: 8,
      right: 8,
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
    },

    heroDuplicate: {
      position: "absolute",
      zIndex: 5,
      top: 8,
      left: 8,
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
    },

    heroActionLedge: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 16,
      borderCurve: "continuous",
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      backgroundColor: canalDynamicColors.surface,
      boxShadow: "0 8px 24px rgba(2, 30, 45, 0.2)",
    },

    heroLedgeAction: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
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

    primaryActionRow: {
      width: "100%",
      minHeight: 54,
      flexDirection: "row",
      gap: 9,
      marginTop: 16,
    },

    startButton: {
      minHeight: 54,
      flex: 1,
      borderRadius: 19,
      borderCurve: "continuous",
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F47A24",
      paddingHorizontal: 22,
      boxShadow: "0 14px 30px rgba(3, 27, 58, 0.18)",
    },

    stageStartButton: {
      width: 54,
      minHeight: 54,
      borderRadius: 19,
      borderCurve: "continuous",
      alignItems: "center",
      justifyContent: "center",
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
      gap: 24,
      paddingVertical: 4,
    },

    actionButton: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
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

    trackSequence: {
      borderWidth: 0,
      paddingHorizontal: 15,
      paddingVertical: 14,
    },

    sectionTitle: {
      color: canalDynamicColors.text,
      fontSize: 19,
      fontWeight: "900",
      marginBottom: 8,
    },

    sequenceHeader: {
      minHeight: 34,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },

    sequenceCount: {
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },

    heroProfile: {
      width: "100%",
      overflow: "hidden",
    },

    profileToggle: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      marginTop: 7,
    },

    profileToggleText: {
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 0.25,
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

    trackRowFirst: {
      minHeight: 78,
      marginHorizontal: -8,
      borderTopWidth: 0,
      borderRadius: 16,
      borderCurve: "continuous",
      paddingHorizontal: 10,
    },

    trackKicker: {
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.9,
      marginBottom: 3,
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
