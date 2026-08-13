import { canalDynamicColors } from "../../theme/canal-dynamic-colors";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Pressable,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import {
  router,
  useFocusEffect,
} from "expo-router";

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  StatusBar,
} from "expo-status-bar";

import Animated, {
  FadeInRight,
  FadeOutRight,
} from "react-native-reanimated";

import {
  CanalHeaderActions,
} from "../../components/canal-ui/canal-header-actions";
import { CanalAmbientBackground } from "../../components/canal-ui/canal-ambient-background";

import {
  scenePresentation,
} from "../../components/canal-ui/scene-signature";

import {
  SceneCardBackdrop,
} from "../../components/canal-ui/scene-card-visual";
import { SceneCardProfile } from "../../components/canal-ui/scene-card-profile";

import {
  RecoveryNotice,
} from "../../components/recovery-notice";

import {
  useReconnectReload,
} from "../../hooks/use-reconnect-reload";

import {
  classifyRecoveryIssue,
} from "../../lib/recovery-issue";

import type {
  RecoveryIssue,
} from "../../lib/recovery-issue";

import {
  getLatestSpotifyLibrarySnapshot,
} from "../../lib/spotify-library";

import type {
  SpotifyLibrarySnapshot,
} from "../../lib/spotify-library";

import type { SpotifyTrack } from "../../lib/spotify-api";
import {
  addCombinedCatalogDiscovery,
  combineSceneMusicLibraries,
  getCanalTrackProvider,
  getCanalTrackProviderId,
  getCanalTrackProviderUrl,
  syncCombinedSceneMusicLibrary,
} from "../../lib/combined-music-library";
import { readAppleMusicLibrarySnapshot } from "../../lib/apple-music";
import type { MusicProviderId } from "../../lib/music-provider-model";
import { addSpotifyArtworkToTracks } from "../../lib/spotify-scene-artwork";
import { ExplicitBadge } from "../../components/explicit-badge";
import { classifyCanalSongDna } from "../../lib/song-dna";
import { readProviderSongMetadata } from "../../lib/provider-song-metadata";
import { readTemporarilyDislikedTrackIds, setSongDisliked, setSongLiked } from "../../lib/song-preferences";
import {
  normalizeSongSceneActionInput,
  songSceneActionParams,
} from "../../lib/song-scene-actions";
import { captureSceneStudioScope } from "../../lib/scene-studio-scope";
import { useAuth } from "../../providers/auth-provider";
import { readAccountCanalSettings } from "../../lib/app-settings";

import {
  rankSceneRecommendations,
} from "../../lib/scene-recommendations";

import {
  getRecentScenes,
  readScenes,
  sceneDurationMinutes,
} from "../../lib/scenes";

import type {
  StoredScene,
} from "../../lib/scenes";

import {
  readListeningHistory,
} from "../../lib/canal-session";

import type {
  ListeningHistoryEntry,
} from "../../lib/canal-session";

import {
  useConnectivity,
} from "../../providers/connectivity-provider";

const QUICK_MOODS = [
  { label: "Focused", value: "focused" },
  { label: "Energized", value: "energized" },
  { label: "Calm", value: "calm" },
  { label: "Social", value: "social" },
] as const;

function momentLabel(date = new Date()): string {
  const day = date.toLocaleDateString(undefined, { weekday: "long" });
  const hour = date.getHours();
  const period = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return `${day} ${period}`.toUpperCase();
}

function trackArtwork(track?: SpotifyTrack): string | undefined {
  return track?.album?.images?.[0]?.url ?? track?.album?.imageUrl;
}

function isUsableOrbitTrack(track: SpotifyTrack): boolean {
  const providerId = getCanalTrackProvider(track);
  const providerTrackId = getCanalTrackProviderId(track);
  return /^[A-Za-z0-9._:-]+$/u.test(providerTrackId) &&
    (providerId === "apple-music" || track.uri === `spotify:track:${providerTrackId}`) &&
    track.name.trim().length > 0 &&
    track.artists.some((artist) => artist.name.trim().length > 0);
}

function SceneCard(props: {
  scene: StoredScene;
  compact?: boolean;
}) {
  const presentation =
    scenePresentation(props.scene);

  return (
    <Pressable
      accessibilityLabel={`Open ${props.scene.name}`}
      accessibilityRole="button"
      onPress={() =>
        router.push({
          pathname:
            "/scenes/[sceneId]",

          params: {
            sceneId:
              props.scene.id,
          },
        })
      }
      style={({ pressed }) => [
        props.compact
          ? styles.compactSceneCard
          : styles.sceneCard,

        {
          backgroundColor:
            presentation.colors[2],
          ...(props.compact ? null : {
            borderColor: `${presentation.accent}40`,
          }),
        },

        pressed &&
          styles.pressed,
      ]}
    >
      <SceneCardBackdrop presentation={presentation} scene={props.scene} />
      <SceneCardProfile
        accent={presentation.accent}
        metadata={`${props.scene.activity || "Any activity"} · ${props.scene.tracks.length} tracks · ${sceneDurationMinutes(props.scene)} min`}
        scene={props.scene}
        variant={props.compact ? "grid" : "compact"}
      />

      {props.scene.favorite ? (
        <Ionicons color={canalDynamicColors.gold} name="star" size={15} style={styles.favoriteMark} />
      ) : null}
    </Pressable>
  );
}

function EmptyScenes() {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyTitle}>
        Your first Scene starts here
      </Text>

      <Text style={styles.emptyText}>
        Connect Apple Music or Spotify, import your library,
        and create a soundtrack for the
        moment you are in.
      </Text>

      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.push(
            "/scene-studio",
          )
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
          Set the Scene
        </Text>
      </Pressable>
    </View>
  );
}

export default function HomeScreen() {
  const { accountEpoch, sessionGeneration, user } = useAuth();
  const scope = useMemo(() => captureSceneStudioScope({ userId: user?.id, accountEpoch, sessionGeneration }), [accountEpoch, sessionGeneration, user?.id]);
  const currentScopeRef = useRef(scope);
  currentScopeRef.current = scope;
  const directionInputRef = useRef<TextInput>(null);
  const [quickMood, setQuickMood] = useState<(typeof QUICK_MOODS)[number]["value"]>("focused");
  const [directRequest, setDirectRequest] = useState("");
  const [orbitArtworkTracks, setOrbitArtworkTracks] = useState<SpotifyTrack[]>([]);
  const [openOrbitActions, setOpenOrbitActions] = useState("");
  const [orbitOffset, setOrbitOffset] = useState(0);
  const [temporarilyDisliked, setTemporarilyDisliked] = useState<string[]>([]);
  const [smartSpotifySync, setSmartSpotifySync] = useState(true);
  useEffect(() => {
    let active = true;
    if (!user?.id) return () => { active = false; };
    void readAccountCanalSettings(user.id).then((settings) => {
      if (active) setSmartSpotifySync(settings.smartSpotifySync);
    });
    return () => { active = false; };
  }, [user?.id]);
  const {
    refresh:
      refreshConnectivity,
    status:
      connectivityStatus,
  } =
    useConnectivity();

  const [
    scenes,
    setScenes,
  ] = useState<StoredScene[]>([]);

  const [
    recentScenes,
    setRecentScenes,
  ] = useState<StoredScene[]>([]);

  const [
    history,
    setHistory,
  ] = useState<
    ListeningHistoryEntry[]
    >([]);

  const [
    spotifySnapshot,
    setSpotifySnapshot,
  ] =
    useState<SpotifyLibrarySnapshot | null>(
      null,
    );
  const [musicProviderIds, setMusicProviderIds] =
    useState<readonly MusicProviderId[]>([]);

  const [
    recommendationWarning,
    setRecommendationWarning,
  ] =
    useState<string | null>(
      null,
    );

  const [
    recommendationIssue,
    setRecommendationIssue,
  ] =
    useState<RecoveryIssue | null>(
      null,
    );

  const [
    refreshingRecommendations,
    setRefreshingRecommendations,
  ] = useState(false);

  const load =
    useCallback(() => {
      let active = true;
      const operationScope = scope;

      const run =
        async (): Promise<void> => {
          const [
            storedScenes,
            storedRecent,
            storedHistory,
            latestSpotify,
            appleMusic,
          ] =
            await Promise.all([
              readScenes(),
              getRecentScenes(5),
              readListeningHistory(),
              getLatestSpotifyLibrarySnapshot(),
              readAppleMusicLibrarySnapshot().catch(() => null),
            ]);
          const combined = combineSceneMusicLibraries(latestSpotify.snapshot, appleMusic);

          if (
            !active ||
            !operationScope ||
            !currentScopeRef.current ||
            operationScope.userId !== currentScopeRef.current.userId ||
            operationScope.accountEpoch !== currentScopeRef.current.accountEpoch ||
            operationScope.sessionGeneration !== currentScopeRef.current.sessionGeneration
          ) {
            return;
          }

          setScenes(
            storedScenes,
          );

          setRecentScenes(
            storedRecent,
          );

          setHistory(
            storedHistory,
          );

          setSpotifySnapshot(
            combined?.snapshot ?? null,
          );
          setMusicProviderIds(combined?.providerIds ?? []);

          setRecommendationWarning(
            combined?.readyProviderIds.length ? null : latestSpotify.warning ?? null,
          );

          setRecommendationIssue(
            combined?.readyProviderIds.length ? null : latestSpotify.issue ?? null,
          );

          if (combined?.readyProviderIds.length) {
            void addCombinedCatalogDiscovery(combined).then((discovered) => {
              if (
                active &&
                operationScope &&
                currentScopeRef.current &&
                operationScope.userId === currentScopeRef.current.userId &&
                operationScope.accountEpoch === currentScopeRef.current.accountEpoch &&
                operationScope.sessionGeneration === currentScopeRef.current.sessionGeneration
              ) {
                setSpotifySnapshot(discovered.snapshot);
              }
            }).catch(() => undefined);
          }
        };

      void run();

      return () => {
        active = false;
      };
    }, [scope]);

  useFocusEffect(load);

  const refreshRecommendations =
    useCallback(
      async (): Promise<void> => {
        const operationScope = scope;
        if (!operationScope) return;

        setRefreshingRecommendations(
          true,
        );

        try {
          const synced =
            await syncCombinedSceneMusicLibrary(musicProviderIds);
          const combined = synced?.readyProviderIds.length
            ? await addCombinedCatalogDiscovery(synced).catch(() => synced)
            : synced;

          if (
            !currentScopeRef.current ||
            operationScope.userId !== currentScopeRef.current.userId ||
            operationScope.accountEpoch !== currentScopeRef.current.accountEpoch ||
            operationScope.sessionGeneration !== currentScopeRef.current.sessionGeneration
          ) {
            return;
          }

          setSpotifySnapshot(
            combined?.snapshot ?? null,
          );
          setMusicProviderIds(combined?.providerIds ?? []);

          setRecommendationWarning(
            null,
          );

          setRecommendationIssue(
            null,
          );
        } catch (error) {
          if (
            !currentScopeRef.current ||
            operationScope.userId !== currentScopeRef.current.userId ||
            operationScope.accountEpoch !== currentScopeRef.current.accountEpoch ||
            operationScope.sessionGeneration !== currentScopeRef.current.sessionGeneration
          ) {
            return;
          }

          setRecommendationIssue(
            classifyRecoveryIssue(
              error,
              {
                service:
                  musicProviderIds.length === 1 && musicProviderIds[0] === "spotify"
                    ? "spotify"
                    : "canal",
                connectivityStatus,
              },
            ),
          );

          setRecommendationWarning(
            "Recommendations are using your last available music-library sync.",
          );
        } finally {
          if (
            currentScopeRef.current &&
            operationScope.userId === currentScopeRef.current.userId &&
            operationScope.accountEpoch === currentScopeRef.current.accountEpoch &&
            operationScope.sessionGeneration === currentScopeRef.current.sessionGeneration
          ) {
            setRefreshingRecommendations(
              false,
            );
          }
        }
      },
      [
        connectivityStatus,
        musicProviderIds,
        scope,
      ],
    );

  const refreshRecommendationsOnReconnect = useCallback(async () => {
    if (smartSpotifySync) await refreshRecommendations();
  }, [refreshRecommendations, smartSpotifySync]);

  useReconnectReload(refreshRecommendationsOnReconnect);

  const recoverRecommendations =
    async (): Promise<void> => {
      if (
        recommendationIssue
          ?.action ===
        "reconnect-spotify"
      ) {
        router.push(
          "/music-services",
        );

        return;
      }

      const nextStatus =
        await refreshConnectivity();

      if (
        nextStatus !==
        "offline"
      ) {
        await refreshRecommendations();
      }
    };

  const recommended =
    rankSceneRecommendations(
      scenes,
      spotifySnapshot,
    )
      .slice(0, 3);

  const continueScene = history[0]
    ? scenes.find((scene) => scene.id === history[0].sceneId)
    : undefined;
  const continueTrack = continueScene?.tracks.find((track) => Boolean(track.imageUrl)) ?? continueScene?.tracks[0];
  const orbitCandidates = useMemo(() => {
    if (!spotifySnapshot) return [];
    const combined = [
      ...spotifySnapshot.discoveryTracks,
      ...spotifySnapshot.recentTracks,
      ...spotifySnapshot.savedTracks,
      ...spotifySnapshot.playlistTracks,
    ];
    const seen = new Set<string>();
    return combined.filter((track) => {
      if (!isUsableOrbitTrack(track) || seen.has(track.id)) return false;
      seen.add(track.id);
      return !continueScene?.tracks.some((item) => item.id === track.id);
    });
  }, [continueScene?.tracks, spotifySnapshot]);
  const orbitTracks = useMemo(() => {
    const disliked = new Set(temporarilyDisliked);
    const available = orbitCandidates.filter((track) => !disliked.has(track.id));
    if (!available.length) return [];
    const start = orbitOffset % available.length;
    return [...available.slice(start), ...available.slice(0, start)].slice(0, 3);
  }, [orbitCandidates, orbitOffset, temporarilyDisliked]);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!scope) { setTemporarilyDisliked([]); return () => { active = false; }; }
    void readTemporarilyDislikedTrackIds(scope, () => currentScopeRef.current).then((ids) => {
      if (active) setTemporarilyDisliked(ids);
    });
    return () => { active = false; };
  }, [scope]));

  useEffect(() => {
    let active = true;
    setOrbitArtworkTracks(orbitTracks.filter((track) => Boolean(trackArtwork(track))));
    void addSpotifyArtworkToTracks(orbitTracks).then((tracks) => {
      if (active) setOrbitArtworkTracks(tracks.filter((track) => Boolean(trackArtwork(track))));
    });
    return () => { active = false; };
  }, [orbitTracks]);

  const openQuickScene = useCallback((track?: SpotifyTrack) => {
    const trackDirection = track
      ? `Include music like ${track.name} by ${track.artists[0]?.name ?? "this artist"}.`
      : directRequest.trim();
    router.push({
      pathname: "/scene-studio",
      params: {
        reset: String(Date.now()),
        quickMood,
        direct: trackDirection || undefined,
        anchorTrackId: track?.id,
      },
    } as never);
  }, [directRequest, quickMood]);

  const orbitSongParams = useCallback((track: SpotifyTrack) => {
    const providerId = getCanalTrackProvider(track);
    const providerUrl = getCanalTrackProviderUrl(track);
    const song = normalizeSongSceneActionInput({
      trackId: track.id,
      title: track.name,
      artist: track.artists[0]?.name ?? "Unknown artist",
      artworkUrl: trackArtwork(track),
      spotifyUrl: providerId === "spotify" ? providerUrl : undefined,
      providerId,
      providerTrackId: getCanalTrackProviderId(track),
      providerUrl,
    });
    return song ? {
      ...songSceneActionParams(song),
      explicit: track.explicit ? "true" : "false",
      genreHints: (spotifySnapshot?.trackGenres[track.id] ?? []).slice(0, 4).join("|"),
      genreSources: providerId,
    } : null;
  }, [spotifySnapshot?.trackGenres]);

  const openOrbitContext = useCallback((track: SpotifyTrack) => {
    const params = orbitSongParams(track);
    if (!params) return;
    setOpenOrbitActions("");
    router.push({ pathname: "/song-context", params } as never);
  }, [orbitSongParams]);

  const openAddToScene = useCallback((track: SpotifyTrack) => {
    const params = orbitSongParams(track);
    if (!params) return;
    setOpenOrbitActions("");
    router.push({ pathname: "/add-song-to-scene", params } as never);
  }, [orbitSongParams]);

  const updateOrbitPreference = useCallback(async (track: SpotifyTrack, preference: "like" | "dislike"): Promise<void> => {
    const operationScope = scope;
    const providerId = getCanalTrackProvider(track);
    const providerUrl = getCanalTrackProviderUrl(track);
    const song = normalizeSongSceneActionInput({
      trackId: track.id,
      title: track.name,
      artist: track.artists[0]?.name ?? "Unknown artist",
      artworkUrl: trackArtwork(track),
      spotifyUrl: providerId === "spotify" ? providerUrl : undefined,
      providerId,
      providerTrackId: getCanalTrackProviderId(track),
      providerUrl,
    });
    if (!operationScope || !song) return;
    setOpenOrbitActions("");
    try {
      const providerMetadata = await readProviderSongMetadata({
        trackId: track.id,
        providerId,
        providerTrackId: getCanalTrackProviderId(track),
        title: track.name,
        artist: song.artist,
      }).catch(() => null);
      const dna = classifyCanalSongDna({
        genreEvidence: providerMetadata?.genreEvidence.length
          ? providerMetadata.genreEvidence
          : [{ provider: providerId, genres: spotifySnapshot?.trackGenres[track.id] ?? [] }],
        title: track.name,
        artist: song.artist,
      });
      if (preference === "like") {
        await setSongLiked(song, dna, true, operationScope, () => currentScopeRef.current);
        setTemporarilyDisliked((current) => current.filter((id) => id !== track.id));
      } else {
        await setSongDisliked(song, dna, true, operationScope, () => currentScopeRef.current);
        setTemporarilyDisliked((current) => current.includes(track.id) ? current : [...current, track.id]);
      }
      setRecommendationWarning(preference === "like" ? "Canal will use this song’s DNA in future Scenes." : "Song replaced and temporarily deprioritized.");
    } catch {
      setRecommendationWarning("Canal could not save that song preference. Try again.");
    }
  }, [scope, spotifySnapshot?.trackGenres]);

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={["top"]}
    >
      <CanalAmbientBackground />
      <StatusBar style="auto" />
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
        onScrollBeginDrag={() => setOpenOrbitActions("")}
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text
              style={
                styles.eyebrow
              }
            >
              {momentLabel()}
            </Text>

            <Text
              style={
                styles.title
              }
            >
              What should this moment sound like?
            </Text>

            <Text
              style={
                styles.subtitle
              }
            >
              Start something new, return to a Scene,
              or bring everyone together live.
            </Text>
          </View>

          <CanalHeaderActions showSettings={false} />
        </View>

        <View style={styles.liveStrip}>
          <View style={styles.liveIcon}>
            <Ionicons color={canalDynamicColors.mint} name="radio-outline" size={23} />
          </View>
          <View style={styles.liveCopy}>
            <Text style={styles.liveEyebrow}>CANAL LIVE</Text>
            <Text style={styles.liveTitle}>Make the room part of the music.</Text>
            <Text style={styles.liveText}>Blend Scenes and listen together.</Text>
          </View>
          <Pressable accessibilityLabel="Start a collaborative Stage" accessibilityRole="button" onPress={() => router.push("/create-stage")} style={({ pressed }) => [styles.liveAction, pressed && styles.pressed]}>
            <Ionicons color={canalDynamicColors.text} name="add" size={23} />
          </Pressable>
          <Pressable accessibilityLabel="Join a Stage with a code" accessibilityRole="button" onPress={() => router.push("/join-stage")} style={({ pressed }) => [styles.liveAction, pressed && styles.pressed]}>
            <Ionicons color={canalDynamicColors.text} name="enter-outline" size={22} />
          </Pressable>
        </View>

        {history[0] ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Continue ${history[0].sceneName}`}
            onPress={() =>
              router.push({
                pathname: "/now-playing",
                params: {
                  sceneId:
                    history[0].sceneId,
                },
              } as never)
            }
            style={({ pressed }) => [
              styles.continueCard,
              pressed && styles.pressed,
            ]}
          >
            {continueTrack?.imageUrl ? (
              <Image
                accessibilityLabel={`${continueTrack.title} artwork`}
                contentFit="cover"
                source={{ uri: continueTrack.imageUrl }}
                style={styles.continueArtwork}
                transition={180}
              />
            ) : null}
            <View style={styles.continueCopy}>
              <Text style={styles.continueEyebrow}>
                CONTINUE LISTENING
              </Text>
              <Text numberOfLines={1} style={styles.continueTitle}>
                {history[0].sceneName}
              </Text>
              {continueTrack ? (
                <Text numberOfLines={1} style={styles.continueMeta}>
                  {continueTrack.title} · {continueTrack.artist}
                </Text>
              ) : null}
            </View>
            <View style={styles.continuePlay}>
              <Ionicons color={canalDynamicColors.text} name="play" size={17} />
            </View>
          </Pressable>
        ) : null}

        <View style={styles.momentCard}>
          <View style={styles.momentHeader}>
            <View>
              <Text style={styles.momentEyebrow}>SET THE MOMENT</Text>
              <Text style={styles.momentTitle}>How should it feel?</Text>
            </View>
            <Pressable
              accessibilityLabel="Open full Scene controls"
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/scene-studio", params: { mode: "new", reset: String(Date.now()) } } as never)}
              style={({ pressed }) => [styles.fullControls, pressed && styles.pressed]}
            >
              <Text style={styles.fullControlsText}>Full controls</Text>
              <Ionicons color={canalDynamicColors.text} name="chevron-forward" size={15} />
            </Pressable>
          </View>

          <View accessibilityLabel="Quick mood" accessibilityRole="radiogroup" style={styles.quickMoods}>
            {QUICK_MOODS.map((mood) => {
              const selected = quickMood === mood.value;
              return (
                <Pressable
                  accessibilityLabel={`Choose ${mood.label} mood`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  key={mood.value}
                  onPress={() => setQuickMood(mood.value)}
                  style={({ pressed }) => [styles.quickMood, selected && styles.quickMoodSelected, pressed && styles.pressed]}
                >
                  <Text style={[styles.quickMoodText, selected && styles.quickMoodTextSelected]}>{mood.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.directionField}>
            <Ionicons color={canalDynamicColors.muted} name="sparkles-outline" size={18} />
            <TextInput
              accessibilityLabel="Direct Canal"
              maxLength={300}
              onChangeText={setDirectRequest}
              placeholder="Direct Canal — instrumental, no repeats…"
              placeholderTextColor={canalDynamicColors.muted}
              ref={directionInputRef}
              returnKeyType="done"
              style={styles.directionInput}
              value={directRequest}
            />
            <Pressable
              accessibilityLabel="Edit Scene direction"
              accessibilityRole="button"
              onPress={() => directionInputRef.current?.focus()}
              style={({ pressed }) => [styles.directionAction, pressed && styles.pressed]}
            >
              <Ionicons color={canalDynamicColors.text} name="create-outline" size={18} />
            </Pressable>
          </View>

          <Pressable
            accessibilityLabel="Create a Scene"
            accessibilityRole="button"
            onPress={() => openQuickScene()}
            style={({ pressed }) => [styles.generateButton, pressed && styles.pressed]}
          >
            <Ionicons color={canalDynamicColors.onAccent} name="pulse" size={19} />
            <Text style={styles.generateButtonText}>Generate a {QUICK_MOODS.find((item) => item.value === quickMood)?.label} Scene</Text>
          </Pressable>
        </View>

        {recommendationIssue?.action ===
        "reconnect-spotify" ? (
          <View
            accessibilityLiveRegion="polite"
            style={
              styles.spotifyReconnectCard
            }
          >
            <View
              style={
                styles.spotifyReconnectCopy
              }
            >
              <Text
                selectable
                style={
                  styles.spotifyReconnectTitle
                }
              >
                Using your saved music
              </Text>
              <Text
                selectable
                style={
                  styles.spotifyReconnectText
                }
              >
                Scenes keep working from the cached library. Reconnect only to refresh Spotify.
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Reconnect Spotify"
              accessibilityRole="button"
              accessibilityState={{
                busy:
                  refreshingRecommendations,
              }}
              disabled={
                refreshingRecommendations
              }
              onPress={() =>
                void recoverRecommendations()
              }
              style={({ pressed }) => [
                styles.spotifyReconnectButton,
                refreshingRecommendations &&
                  styles.disabled,
                pressed &&
                  styles.pressed,
              ]}
            >
              <Text
                style={
                  styles.spotifyReconnectButtonText
                }
              >
                Reconnect
              </Text>
            </Pressable>
          </View>
        ) : null}

        {scenes.length === 0 ? (
          <EmptyScenes />
        ) : (
          <>
            <View
              style={
                styles.sectionHeader
              }
            >
              <View style={styles.sectionCopy}>
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Made for now
                </Text>

                <Text
                  style={
                    styles.sectionSubtitle
                  }
                >
                  Based on your connected music
                  libraries, favorites, plays, and
                  feedback.
                </Text>
              </View>

              <Pressable
                accessibilityLabel="See all Scenes"
                accessibilityRole="button"
                onPress={() =>
                  router.push(
                    "/(tabs)/library",
                  )
                }
                hitSlop={6}
                style={({ pressed }) => [
                  styles.seeAllButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={
                    styles.seeAll
                  }
                >
                  See all
                </Text>
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={
                false
              }
              contentContainerStyle={
                styles.horizontalScenes
              }
            >
              {recommended.map(
                (scene) => (
                  <SceneCard
                    key={scene.id}
                    scene={scene}
                    compact
                  />
                ),
              )}
            </ScrollView>

            {recommendationIssue &&
            recommendationIssue.action !==
              "reconnect-spotify" ? (
              <RecoveryNotice
                busy={
                  refreshingRecommendations
                }
                issue={
                  recommendationIssue
                }
                onAction={
                  recoverRecommendations
                }
              />
            ) : recommendationWarning ? (
              <Text
                selectable
                style={
                  styles.recommendationWarning
                }
              >
                {recommendationWarning}
              </Text>
            ) : null}

            <View style={styles.sectionHeader}>
              <View style={styles.sectionCopy}>
                <Text style={styles.sectionTitle}>New to your orbit</Text>
                <Text style={styles.sectionSubtitle}>Fresh catalog discoveries and library finds worth bringing into a Scene.</Text>
              </View>
              <Pressable accessibilityLabel="Refresh New to your orbit" accessibilityHint="Shows a different set of cached songs without requesting a music service again" accessibilityRole="button" disabled={orbitCandidates.length <= 3} onPress={() => { setOpenOrbitActions(""); setOrbitOffset((current) => current + 3); }} style={({ pressed }) => [styles.orbitRefresh, pressed && styles.pressed, orbitCandidates.length <= 3 && styles.disabled]}>
                <Ionicons color={canalDynamicColors.text} name="refresh-outline" size={20} />
              </Pressable>
            </View>

            {orbitArtworkTracks.length > 0 ? (
              <View style={styles.orbitList}>
                {orbitArtworkTracks.map((track) => (
                  <View key={track.id} style={styles.orbitRowWrapper}>
                    <Pressable
                      accessibilityLabel={`View context for ${track.name}`}
                      accessibilityRole="button"
                      onPress={() => openOrbitContext(track)}
                      style={({ pressed }) => [styles.orbitRow, pressed && styles.pressed]}
                    >
                      {trackArtwork(track) ? <View style={styles.artworkBadgeWrap}><Image accessibilityLabel={`${track.name} artwork`} contentFit="cover" source={{ uri: trackArtwork(track) }} style={styles.orbitArtwork} transition={180} /><ExplicitBadge explicit={track.explicit} style={styles.artworkBadge} /></View> : null}
                      <View style={styles.orbitCopy}>
                        <Text numberOfLines={1} style={styles.orbitTitle}>{track.name}</Text>
                        <Text numberOfLines={1} style={styles.orbitArtist}>{track.artists.map((artist) => artist.name).join(", ")}</Text>
                      </View>
                      <View style={styles.orbitManageSpace} />
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`${openOrbitActions === track.id ? "Close" : "Manage"} ${track.name} actions`}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: openOrbitActions === track.id }}
                      onPress={() => setOpenOrbitActions((current) => current === track.id ? "" : track.id)}
                      style={({ pressed }) => [styles.orbitManageButton, pressed && styles.pressed]}
                    >
                      <Ionicons color={canalDynamicColors.text} name="ellipsis-horizontal" size={20} />
                    </Pressable>
                    {openOrbitActions === track.id ? (
                      <Animated.View entering={FadeInRight.duration(170)} exiting={FadeOutRight.duration(130)} style={styles.orbitActionLedge}>
                        <View accessibilityLabel={`${track.name} actions`} accessibilityRole="menu" style={styles.orbitActionLedgeInner}>
                          <Pressable accessibilityLabel={`Open ${track.name} in ${getCanalTrackProvider(track) === "spotify" ? "Spotify" : "Apple Music"}`} accessibilityRole="button" disabled={!getCanalTrackProviderUrl(track)} onPress={() => { const url = getCanalTrackProviderUrl(track); setOpenOrbitActions(""); if (url) void Linking.openURL(url); }} style={({ pressed }) => [styles.orbitAction, pressed && styles.orbitActionPressed]}>
                            <Ionicons color={getCanalTrackProvider(track) === "spotify" ? "#1DB954" : canalDynamicColors.text} name="open-outline" size={18} />
                          </Pressable>
                          <Pressable accessibilityLabel={`Like ${track.name}`} accessibilityRole="button" onPress={() => { void updateOrbitPreference(track, "like"); }} style={({ pressed }) => [styles.orbitAction, pressed && styles.orbitActionPressed]}>
                            <Ionicons color={canalDynamicColors.mint} name="heart-outline" size={18} />
                          </Pressable>
                          <Pressable accessibilityLabel={`Dislike ${track.name}`} accessibilityHint="Temporarily replaces and deprioritizes this song" accessibilityRole="button" onPress={() => { void updateOrbitPreference(track, "dislike"); }} style={({ pressed }) => [styles.orbitAction, pressed && styles.orbitActionPressed]}>
                            <Ionicons color={canalDynamicColors.danger} name="remove-circle-outline" size={18} />
                          </Pressable>
                          <Pressable accessibilityLabel={`Add ${track.name} to a Scene`} accessibilityRole="button" onPress={() => openAddToScene(track)} style={({ pressed }) => [styles.orbitAction, pressed && styles.orbitActionPressed]}>
                            <Ionicons color={canalDynamicColors.text} name="add-circle-outline" size={19} />
                          </Pressable>
                          <Pressable accessibilityLabel={`Create a Scene from ${track.name}`} accessibilityRole="button" onPress={() => { setOpenOrbitActions(""); openQuickScene(track); }} style={({ pressed }) => [styles.orbitAction, pressed && styles.orbitActionPressed]}>
                            <Ionicons color={canalDynamicColors.text} name="sparkles-outline" size={18} />
                          </Pressable>
                        </View>
                      </Animated.View>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : <Text style={styles.orbitEmpty}>Sync Spotify or Apple Music to bring real tracks and artwork into this section.</Text>}

            <View
              style={
                styles.sectionHeader
              }
            >
              <View>
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  Recent Scenes
                </Text>

                <Text
                  style={
                    styles.sectionSubtitle
                  }
                >
                  Continue where you left off.
                </Text>
              </View>
            </View>

            <ScrollView
              accessibilityLabel="Recent Scenes"
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalScenes}
            >
              {(recentScenes.length > 0
                ? recentScenes
                : scenes.slice(0, 4)
              ).map((scene) => (
                <SceneCard
                  compact
                  key={scene.id}
                  scene={scene}
                />
              ))}
            </ScrollView>
          </>
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
        "transparent",
    },

    content: {
      paddingHorizontal: 20,
      paddingBottom: 110,
    },

    header: {
      flexDirection: "row",
      alignItems:
        "flex-start",
      justifyContent:
        "space-between",
      paddingTop: 12,
      marginBottom: 22,
    },

    headerCopy: {
      flex: 1,
      minWidth: 0,
      paddingRight: 4,
    },

    eyebrow: {
      color: canalDynamicColors.gold,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1.4,
    },

    title: {
      color: canalDynamicColors.text,
      fontFamily: "Georgia",
      fontSize: 35,
      lineHeight: 39,
      fontWeight: "500",
      letterSpacing: -1.1,
      marginTop: 4,
    },

    subtitle: {
      maxWidth: 280,
      color: canalDynamicColors.muted,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 5,
    },

    spotifyButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#1DB954",
    },

    spotifyButtonText: {
      color: "#041F13",
      fontSize: 20,
      fontWeight: "900",
    },

    stageStrip: {
      gap: 14,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      backgroundColor: canalDynamicColors.surface,
      boxShadow: "0 16px 38px rgba(2, 24, 43, 0.12)",
      padding: 18,
      marginBottom: 18,
    },

    continueCard: {
      minHeight: 68,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      borderRadius: 19,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      backgroundColor: canalDynamicColors.surface,
      padding: 10,
      marginBottom: 11,
    },

    continueCopy: {
      flex: 1,
      minWidth: 0,
    },

    continueArtwork: {
      width: 54,
      height: 54,
      borderRadius: 14,
    },

    continueEyebrow: {
      color: canalDynamicColors.mint,
      fontSize: 8,
      fontWeight: "800",
      letterSpacing: 1,
    },

    continueTitle: {
      color: canalDynamicColors.text,
      fontFamily: "Georgia",
      fontSize: 17,
      fontWeight: "500",
      marginTop: 3,
    },

    continueMeta: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      marginTop: 2,
    },

    continuePlay: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 22,
      backgroundColor: canalDynamicColors.elevated,
    },

    continuePlayText: {
      color: canalDynamicColors.text,
      fontSize: 15,
    },

    momentCard: {
      borderRadius: 27,
      borderCurve: "continuous",
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      backgroundColor: canalDynamicColors.surface,
      padding: 18,
      marginBottom: 26,
      boxShadow: "0 18px 46px rgba(2, 24, 43, 0.16)",
      gap: 15,
    },

    momentHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },

    momentEyebrow: {
      color: canalDynamicColors.mint,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1.2,
    },

    momentTitle: {
      color: canalDynamicColors.text,
      fontFamily: "Georgia",
      fontSize: 22,
      marginTop: 3,
    },

    fullControls: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingLeft: 12,
      gap: 2,
    },

    fullControlsText: {
      color: canalDynamicColors.text,
      fontSize: 12,
      fontWeight: "700",
    },

    quickMoods: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },

    quickMood: {
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 15,
      borderRadius: 24,
      borderCurve: "continuous",
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      backgroundColor: canalDynamicColors.elevated,
    },

    quickMoodSelected: {
      borderColor: canalDynamicColors.mint,
      backgroundColor: canalDynamicColors.elevated,
    },

    quickMoodText: {
      color: canalDynamicColors.muted,
      fontSize: 13,
      fontWeight: "700",
    },

    quickMoodTextSelected: {
      color: canalDynamicColors.text,
    },

    directionField: {
      minHeight: 54,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      paddingLeft: 14,
      borderRadius: 18,
      borderCurve: "continuous",
      backgroundColor: canalDynamicColors.elevated,
    },

    directionInput: {
      flex: 1,
      minWidth: 0,
      minHeight: 48,
      color: canalDynamicColors.text,
      fontSize: 13,
    },

    directionAction: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
    },

    generateButton: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      borderRadius: 18,
      borderCurve: "continuous",
      backgroundColor: canalDynamicColors.mint,
    },

    generateButtonText: {
      color: canalDynamicColors.onAccent,
      fontSize: 14,
      fontWeight: "900",
    },

    liveStrip: {
      minHeight: 78,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 11,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: canalDynamicColors.line,
      marginBottom: 25,
    },

    liveIcon: {
      width: 40,
      alignItems: "center",
    },

    liveCopy: {
      flex: 1,
      minWidth: 0,
    },

    liveEyebrow: {
      color: canalDynamicColors.mint,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1.1,
    },

    liveTitle: {
      color: canalDynamicColors.text,
      fontFamily: "Georgia",
      fontSize: 15,
      marginTop: 2,
    },

    liveText: {
      color: canalDynamicColors.muted,
      fontSize: 10,
      marginTop: 2,
    },

    liveAction: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
    },

    orbitList: {
      gap: 9,
      marginBottom: 26,
    },

    orbitRefresh: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
    },

    orbitRowWrapper: {
      position: "relative",
      zIndex: 1,
    },

    orbitRow: {
      minHeight: 62,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      borderRadius: 18,
      borderCurve: "continuous",
      backgroundColor: canalDynamicColors.surface,
      padding: 7,
    },

    orbitManageSpace: {
      width: 48,
      height: 48,
    },

    orbitManageButton: {
      position: "absolute",
      right: 7,
      top: 7,
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 4,
    },

    orbitActionLedge: {
      position: "absolute",
      right: 55,
      top: 7,
      zIndex: 5,
    },

    orbitActionLedgeInner: {
      minHeight: 48,
      flexDirection: "row",
      overflow: "hidden",
      borderRadius: 16,
      borderCurve: "continuous",
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      backgroundColor: canalDynamicColors.surface,
      boxShadow: "0 8px 24px rgba(2, 30, 45, 0.2)",
    },

    orbitArtwork: {
      width: 48,
      height: 48,
      borderRadius: 11,
    },

    artworkBadgeWrap: { position: "relative" },
    artworkBadge: { bottom: -3, position: "absolute", right: -3 },

    orbitCopy: {
      flex: 1,
      minWidth: 0,
    },

    orbitTitle: {
      color: canalDynamicColors.text,
      fontSize: 13,
      fontWeight: "800",
    },

    orbitArtist: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      marginTop: 2,
    },

    orbitAction: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
    },

    orbitActionPressed: {
      backgroundColor: canalDynamicColors.elevated,
    },

    orbitEmpty: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      lineHeight: 18,
      marginBottom: 24,
    },

    stageStripCopy: {
      gap: 4,
    },

    stageStripEyebrow: {
      color: canalDynamicColors.mint,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.3,
    },

    stageStripTitle: {
      color: canalDynamicColors.text,
      fontFamily: "Georgia",
      fontSize: 21,
      fontWeight: "900",
    },

    stageStripText: {
      color: canalDynamicColors.muted,
      fontSize: 13,
      lineHeight: 18,
    },

    stageStripActions: {
      flexDirection: "row",
      gap: 10,
    },

    stagePrimary: {
      minHeight: 48,
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 15,
      backgroundColor: canalDynamicColors.mint,
    },

    stagePrimaryText: {
      color: canalDynamicColors.onAccent,
      fontSize: 13,
      fontWeight: "900",
    },

    stageJoin: {
      minHeight: 48,
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 15,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
    },

    stageJoinText: {
      color: canalDynamicColors.text,
      fontSize: 13,
      fontWeight: "800",
    },

    hero: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor:
        canalDynamicColors.surface,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      borderRadius: 25,
      padding: 18,
      marginBottom: 27,
    },

    heroOrb: {
      width: 57,
      height: 57,
      borderRadius: 29,
      alignItems:
        "center",
      justifyContent:
        "center",
      borderWidth: 1,
      borderColor: canalDynamicColors.goldLine,
      backgroundColor:
        canalDynamicColors.goldSurface,
      marginRight: 14,
    },

    heroOrbText: {
      color: canalDynamicColors.gold,
      fontSize: 30,
      lineHeight: 32,
    },

    heroText: {
      flex: 1,
    },

    heroTitle: {
      color: canalDynamicColors.text,
      fontSize: 19,
      fontWeight: "900",
    },

    heroDescription: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 4,
    },

    heroArrow: {
      color: canalDynamicColors.mint,
      fontSize: 30,
      marginLeft: 8,
    },

    emptyCard: {
      backgroundColor: canalDynamicColors.surface,
      borderRadius: 22,
      padding: 20,
      marginBottom: 22,
    },

    emptyTitle: {
      color: canalDynamicColors.text,
      fontSize: 20,
      fontWeight: "900",
    },

    emptyText: {
      color: canalDynamicColors.muted,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 7,
      marginBottom: 16,
    },

    primaryButton: {
      minHeight: 50,
      borderRadius: 16,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        canalDynamicColors.gold,
    },

    primaryButtonText: {
      color: canalDynamicColors.onAccent,
      fontSize: 15,
      fontWeight: "800",
    },

    sectionHeader: {
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 12,
      marginBottom: 12,
      marginTop: 4,
    },

    sectionCopy: {
      flex: 1,
      minWidth: 0,
    },

    sectionTitle: {
      color: canalDynamicColors.text,
      fontFamily: "Georgia",
      fontSize: 22,
      fontWeight: "500",
    },

    sectionSubtitle: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      marginTop: 3,
    },

    seeAll: {
      color: canalDynamicColors.gold,
      fontSize: 13,
      fontWeight: "800",
    },

    seeAllButton: {
      minWidth: 62,
      minHeight: 48,
      flexShrink: 0,
      alignItems: "flex-end",
      justifyContent: "center",
      paddingHorizontal: 4,
    },

    horizontalScenes: {
      paddingRight: 10,
      paddingBottom: 23,
      gap: 12,
    },

    recommendationWarning: {
      color: "#F0D17E",
      fontSize: 12,
      lineHeight: 17,
      paddingHorizontal: 2,
    },

    spotifyReconnectCard: {
      minHeight: 72,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 13,
      marginBottom: 18,
      borderRadius: 20,
      borderCurve: "continuous",
      backgroundColor: canalDynamicColors.surface,
      boxShadow: "0 10px 28px rgba(3, 18, 39, 0.14)",
    },

    spotifyReconnectCopy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },

    spotifyReconnectTitle: {
      color: canalDynamicColors.text,
      fontSize: 13,
      fontWeight: "800",
    },

    spotifyReconnectText: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      lineHeight: 15,
    },

    spotifyReconnectButton: {
      minWidth: 100,
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 14,
      borderRadius: 24,
      borderCurve: "continuous",
      backgroundColor: "#1DB954",
    },

    spotifyReconnectButtonText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "800",
    },

    disabled: {
      opacity: 0.55,
    },

    compactSceneCard: {
      width: 184,
      minHeight: 168,
      borderRadius: 22,
      borderCurve: "continuous",
      overflow: "hidden",
      padding: 17,
    },

    sceneCard: {
      minHeight: 155,
      backgroundColor: canalDynamicColors.surface,
      borderRadius: 21,
      borderCurve: "continuous",
      borderWidth: 1,
      overflow: "hidden",
      padding: 17,
      marginBottom: 12,
      boxShadow: "0 14px 32px rgba(3, 18, 39, 0.2)",
    },

    sceneAccent: {
      width: 38,
      height: 5,
      borderRadius: 3,
      backgroundColor:
        "#F47A24",
      marginBottom: 15,
    },

    sceneActivity: {
      color: canalDynamicColors.gold,
      fontSize: 10,
      fontWeight: "900",
      textTransform:
        "uppercase",
      letterSpacing: 0.9,
    },

    sceneName: {
      color: canalDynamicColors.text,
      fontSize: 20,
      fontWeight: "900",
      marginTop: 5,
    },

    sceneMood: {
      color: "#B8C3BE",
      fontSize: 13,
      lineHeight: 18,
      marginTop: 5,
    },

    sceneMeta: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      marginTop: 14,
    },

    favoriteMark: {
      position: "absolute",
      top: 16,
      right: 16,
      color: canalDynamicColors.gold,
      fontSize: 16,
    },

    statsCard: {
      backgroundColor:
        canalDynamicColors.surface,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      borderRadius: 22,
      padding: 18,
      marginTop: 10,
    },

    statsTitle: {
      color: canalDynamicColors.text,
      fontSize: 16,
      fontWeight: "900",
    },

    statsRow: {
      flexDirection: "row",
      marginTop: 15,
    },

    stat: {
      flex: 1,
      alignItems:
        "center",
    },

    statValue: {
      color: canalDynamicColors.text,
      fontSize: 24,
      fontWeight: "900",
    },

    statLabel: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      marginTop: 2,
    },

    pressed: {
      opacity: 0.7,
    },
  });
