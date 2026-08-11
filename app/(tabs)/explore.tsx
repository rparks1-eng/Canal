import { canalDynamicColors } from "../../theme/canal-dynamic-colors";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

import Animated, {
  FadeInUp,
} from "react-native-reanimated";

import { ProfileAvatar } from "../../components/profile-avatar";
import { CanalHeaderActions } from "../../components/canal-ui/canal-header-actions";
import { SceneCardProfile } from "../../components/canal-ui/scene-card-profile";
import { VerifiedAccountBadge } from "../../components/verified-account-badge";
import {
  scenePresentation,
  stagePresentation,
} from "../../components/canal-ui/scene-signature";

import {
  SceneCardBackdrop,
} from "../../components/canal-ui/scene-card-visual";

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
  loadExploreScenes,
  savePublicSceneToLibrary,
} from "../../lib/social";

import type {
  PublicCanalScene,
} from "../../lib/social";

import {
  useConnectivity,
} from "../../providers/connectivity-provider";

import {
  getCurrentLiveStageTrack,
  readPublicLiveStages,
} from "../../lib/live-stages";

import type {
  LiveStage,
  LiveStageKind,
} from "../../lib/live-stages";
import {
  addSpotifyArtworkToLiveStage,
} from "../../lib/spotify-scene-artwork";
import {
  exploreCategoryIcon,
  exploreCategoryValues,
} from "../../lib/explore-categories";
import {
  rankExploreScenes,
  rankExploreStages,
} from "../../lib/explore-personalization";
import {
  readSpotifyLibrarySnapshot,
} from "../../lib/spotify-library";

type ExploreContent =
  | "scenes"
  | "stages";

type StageFilter = "all" | LiveStageKind;

type StageFacet =
  | { kind: "all" }
  | { kind: "activity" | "mood"; value: string };

function splitFacetValues(value: string | undefined): string[] {
  return exploreCategoryValues(value);
}

function topFacetValues(values: string[], limit = 40): string[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const value of values) {
    const key = value.toLowerCase();
    const current = counts.get(key);
    counts.set(key, { label: current?.label ?? value, count: (current?.count ?? 0) + 1 });
  }
  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, limit)
    .map((item) => item.label);
}

function filterExploreStages(
  stages: readonly LiveStage[],
  query: string,
  filter: StageFilter,
  facet: StageFacet,
): LiveStage[] {
  const needle = query.trim().toLowerCase();
  return stages.filter((stage) => {
    if (stage.visibility !== "public" || stage.status !== "live") return false;
    if (filter !== "all" && stage.stageKind !== filter) return false;
    if (facet.kind === "activity" && stage.activity.toLowerCase() !== facet.value.toLowerCase()) return false;
    if (facet.kind === "mood" && !(stage.atmosphereSignals ?? []).some((value) => value.toLowerCase() === facet.value.toLowerCase())) return false;
    if (!needle) return true;
    return [stage.name, stage.hostName, stage.hostUsername, stage.activity, ...(stage.atmosphereSignals ?? [])]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

function PublicStageCard({ stage }: { stage: LiveStage }) {
  const track = getCurrentLiveStageTrack(stage);
  const presentation = stagePresentation(stage);
  const provenance = stage.stageKind === "canal"
    ? "CANAL"
    : stage.stageKind === "verified"
      ? "VERIFIED"
      : "COMMUNITY";

  return (
    <Pressable
      accessibilityLabel={`Play ${stage.name}, live Stage hosted by ${stage.hostName}`}
      accessibilityRole="button"
      onPress={() => router.push({
        pathname: "/live-stage/[stageId]",
        params: { stageId: stage.id },
      })}
      style={({ pressed }) => [
        styles.stageResult,
        { borderColor: `${presentation.accent}4D` },
        pressed && styles.pressed,
      ]}
    >
      <SceneCardBackdrop presentation={presentation} />
      <View style={styles.stageResultTop}>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveBadgeText}>LIVE</Text>
        </View>
        <Text style={[styles.stageProvenance, { color: presentation.accent }]}>{provenance}</Text>
        <Text style={styles.stageAudience}>{stage.participantCount} in room</Text>
      </View>
      <Text numberOfLines={2} style={styles.stageResultName}>{stage.name}</Text>
      <View style={styles.stageHostIdentity}>
        <ProfileAvatar
          avatarUrl={stage.hostAvatarUrl}
          displayName={stage.hostName}
          size={30}
        />
        <Text numberOfLines={1} style={styles.stageResultMeta}>
          @{stage.hostUsername} · {stage.activity || "Live music"} · {stage.tracks.length} tracks
        </Text>
      </View>
      <View style={styles.stageNowPlaying}>
        {track?.imageUrl ? (
          <Image
            accessibilityLabel={`${track.title} album artwork`}
            contentFit="cover"
            source={track.imageUrl}
            style={styles.stageArtwork}
            transition={160}
          />
        ) : (
          <View style={styles.stageArtworkFallback} />
        )}
        <View style={styles.stageTrackCopy}>
          <Text style={styles.stageTrackKicker}>NOW PLAYING</Text>
          <Text numberOfLines={1} style={styles.stageTrackTitle}>
            {track?.title ?? "The Stage queue is ready"}
          </Text>
          <Text numberOfLines={1} style={styles.stageTrackArtist}>
            {track?.artist ?? "Open to listen"}
          </Text>
        </View>
        <Text style={styles.stagePlay}>›</Text>
      </View>
    </Pressable>
  );
}

function HighlightedSceneCard({
  item,
}: {
  item: PublicCanalScene;
}) {
  const presentation =
    scenePresentation(
      item.scene,
    );

  return (
    <Pressable
      accessibilityLabel={`Open highlighted Scene ${item.scene.name}`}
      accessibilityRole="button"
      onPress={() =>
        router.push({
          pathname:
            "/public-scene",
          params: {
            ownerId:
              item.ownerId,
            sceneId:
              item.sceneId,
          },
        } as never)
      }
      style={({
        pressed,
      }) => [
        styles.highlightedCard,
        {
          backgroundColor:
            presentation.colors[2],
        },
        pressed &&
          styles.pressed,
      ]}
    >
      <SceneCardBackdrop
        presentation={
          presentation
        }
        scene={
          item.scene
        }
      />

      <View
        style={
          styles.highlightedCreator
        }
      >
        <ProfileAvatar
          avatarUrl={
            item.creator.avatarUrl
          }
          displayName={
            item.creator.displayName
          }
          size={30}
        />
        <Text
          numberOfLines={1}
          style={
            styles.highlightedCreatorName
          }
        >
          {item.creator.displayName}
        </Text>
        <VerifiedAccountBadge
          size={14}
        />
      </View>

      <View
        style={
          styles.highlightedCopy
        }
      >
        <Text
          numberOfLines={2}
          style={
            styles.highlightedName
          }
        >
          {item.scene.name}
        </Text>
        <Text
          numberOfLines={1}
          style={
            styles.highlightedMeta
          }
        >
          {item.scene.activity ||
            "Any moment"} · {item.scene.tracks.length} tracks
        </Text>
      </View>
    </Pressable>
  );
}

function TrendingStageCard({
  stage,
}: {
  stage: LiveStage;
}) {
  const presentation =
    stagePresentation(
      stage,
    );
  const currentTrack =
    getCurrentLiveStageTrack(
      stage,
    );

  return (
    <Pressable
      accessibilityLabel={`Join trending Stage ${stage.name}`}
      accessibilityRole="button"
      onPress={() =>
        router.push({
          pathname:
            "/live-stage/[stageId]",
          params: {
            stageId:
              stage.id,
          },
        })
      }
      style={({
        pressed,
      }) => [
        styles.trendingStageCard,
        {
          backgroundColor:
            presentation.colors[2],
        },
        pressed &&
          styles.pressed,
      ]}
    >
      <SceneCardBackdrop
        presentation={
          presentation
        }
      />

      <View
        style={
          styles.trendingLiveLine
        }
      >
        <View
          style={
            styles.liveDot
          }
        />
        <Text
          style={
            styles.trendingLiveText
          }
        >
          LIVE
        </Text>
        <Text
          style={
            styles.trendingAudience
          }
        >
          {stage.listenerCount} listening
        </Text>
      </View>

      <Text
        numberOfLines={2}
        style={
          styles.trendingStageName
        }
      >
        {stage.name}
      </Text>

      <Text
        numberOfLines={1}
        style={
          styles.trendingStageMeta
        }
      >
        {currentTrack
          ? `${currentTrack.title} · ${currentTrack.artist}`
          : `${stage.activity || "Live music"} · ${stage.hostName}`}
      </Text>
    </Pressable>
  );
}

function PublicSceneCard(
  props: {
    item: PublicCanalScene;
    saving: boolean;
    onSave: () => void;
  },
) {
  const {
    item,
  } = props;
  const presentation = scenePresentation(item.scene);
  const saveDisabled = item.isMine || item.savedByMe || props.saving;

  const artistPreview =
    item.scene.tracks
      .slice(
        0,
        3,
      )
      .map(
        (track) =>
          track.artist,
      )
      .filter(
        Boolean,
      )
      .join(
        ", ",
      );

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: presentation.colors[2],
          borderColor: `${presentation.accent}40`,
        },
      ]}
    >
      <SceneCardBackdrop presentation={presentation} scene={item.scene} />
      <Pressable
        accessibilityLabel={`Open ${item.scene.name}`}
        accessibilityRole="button"
        onPress={() =>
          router.push({
            pathname:
              "/public-scene",

            params: {
              ownerId:
                item.ownerId,

              sceneId:
                item.sceneId,
            },
          } as never)
        }
        style={({
          pressed,
        }) => [
          styles.scenePressable,

          pressed &&
            styles.pressed,
        ]}
      >
        <SceneCardProfile
          accent={presentation.accent}
          metadata={`${item.scene.activity || "Any activity"} · ${item.scene.tracks.length} tracks`}
          scene={item.scene}
          secondary={artistPreview || item.scene.emotions || "Canal Scene"}
          variant="compact"
        />
      </Pressable>

      <View
        style={
          styles.creatorRow
        }
      >
        <Pressable
          accessibilityLabel={`Open creator ${item.creator.displayName}`}
          accessibilityRole="button"
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
          style={({
            pressed,
          }) => [
            styles.creatorButton,

            pressed &&
              styles.pressed,
          ]}
        >
          <ProfileAvatar
            avatarUrl={item.creator.avatarUrl}
            displayName={item.creator.displayName}
            size={34}
          />

          <View
            style={
              styles.creatorText
            }
          >
            <Text
              numberOfLines={
                1
              }
              style={
                styles.creatorName
              }
            >
              {item.creator.displayName}
              {item.isMine
                ? " · You"
                : ""}
            </Text>

            <Text
              style={
                styles.creatorHandle
              }
            >
              {item.creator.handle}
            </Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={
            saveDisabled
          }
          onPress={
            props.onSave
          }
          style={[
            styles.saveButton,

            {
              backgroundColor: presentation.accent,
            },

            saveDisabled &&
              styles.saveButtonDisabled,
          ]}
        >
          {props.saving ? (
            <ActivityIndicator
              color={presentation.accentText}
              size="small"
            />
          ) : (
            <Text style={[styles.saveButtonText, { color: saveDisabled ? canalDynamicColors.muted : presentation.accentText }]}>
              {item.isMine
                ? "Yours"
                : item.savedByMe
                  ? "Saved"
                  : "Save"}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function FacetRail(props: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  kind: "activity" | "mood" | "genre";
  values: string[];
}) {
  if (props.values.length === 0) return null;
  return (
    <View style={styles.discoverySection}>
      <View style={styles.discoveryHeading}>
        <Text style={styles.discoveryTitle}>{props.title}</Text>
        <Pressable
          accessibilityLabel={`View all ${props.title.toLowerCase()}`}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/explore-category-directory", params: { kind: props.kind } })}
          style={({ pressed }) => [styles.discoveryAllButton, pressed && styles.pressed]}
        >
          <Ionicons color={props.accent} name="chevron-forward" size={20} />
        </Pressable>
      </View>
      <ScrollView horizontal contentContainerStyle={styles.discoveryRail} showsHorizontalScrollIndicator={false}>
        {props.values.slice(0, 5).map((value) => {
          const icon = exploreCategoryIcon(props.kind, value);
          const categoryPresentation = scenePresentation({
            name: "",
            activity: props.kind === "activity" ? value : "",
            emotions: props.kind === "mood" ? value : "",
            genres: props.kind === "genre" ? value : "",
            energy: "medium",
          });
          return (
            <Pressable
              key={`${props.kind}:${value}`}
              accessibilityLabel={`Open ${value} ${props.kind} Scenes`}
              accessibilityRole="button"
              onPress={() => router.push({
                pathname: "/explore-category",
                params: { kind: props.kind, value },
              })}
              style={({ pressed }) => [
                styles.categoryCard,
                pressed && styles.pressed,
              ]}
            >
              <Text numberOfLines={1} style={styles.categoryCardLabel}>{value}</Text>
              <Ionicons
                color={categoryPresentation.accent}
                name={icon as never}
                size={45}
                style={styles.categoryGlyph}
              />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function StageFacetRail(props: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  kind: "activity" | "mood";
  values: string[];
  selected: StageFacet;
  onSelect: (facet: StageFacet) => void;
}) {
  if (props.values.length === 0) return null;
  return (
    <View style={styles.discoverySection}>
      <View style={styles.discoveryHeading}>
        <Text style={styles.discoveryTitle}>{props.title}</Text>
      </View>
      <ScrollView horizontal contentContainerStyle={styles.discoveryRail} showsHorizontalScrollIndicator={false}>
        {props.values.slice(0, 5).map((value) => {
          const selected = props.selected.kind === props.kind && props.selected.value === value;
          const icon = exploreCategoryIcon(props.kind, value);
          const presentation = scenePresentation({
            name: "",
            activity: props.kind === "activity" ? value : "",
            emotions: props.kind === "mood" ? value : "",
            genres: "",
            energy: "medium",
          });
          return (
            <Pressable
              key={`${props.kind}:${value}`}
              accessibilityLabel={`Filter live Stages by ${value}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => props.onSelect(selected ? { kind: "all" } : { kind: props.kind, value })}
              style={({ pressed }) => [styles.categoryCard, pressed && styles.pressed]}
            >
              <Text numberOfLines={1} style={styles.categoryCardLabel}>{value}</Text>
              <Ionicons
                color={presentation.accent}
                name={icon as never}
                size={45}
                style={styles.categoryGlyph}
              />
              {selected ? <View style={[styles.categorySelectedDot, { backgroundColor: presentation.accent }]} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function VerifiedCreatorRail(props: {
  creators: { ownerId: string; creator: PublicCanalScene["creator"] }[];
}) {
  if (props.creators.length === 0) return null;
  return (
    <View style={styles.discoverySection}>
      <View style={styles.discoveryHeading}>
        <View style={[styles.discoveryIcon, styles.verifiedDiscoveryIcon]}>
          <VerifiedAccountBadge size={17} />
        </View>
        <Text style={styles.discoveryTitle}>Verified creators</Text>
      </View>
      <ScrollView horizontal contentContainerStyle={styles.creatorRail} showsHorizontalScrollIndicator={false}>
        {props.creators.map(({ ownerId, creator }) => {
          return (
            <Pressable
              key={ownerId}
              accessibilityLabel={`Open verified creator ${creator.displayName}`}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/creator/[userId]", params: { userId: ownerId } })}
              style={({ pressed }) => [styles.creatorDiscoveryCard, pressed && styles.pressed]}
            >
              <ProfileAvatar avatarUrl={creator.avatarUrl} displayName={creator.displayName} size={48} />
              <Text numberOfLines={1} style={styles.creatorDiscoveryName}>{creator.displayName}</Text>
              <Text numberOfLines={1} style={styles.creatorDiscoveryHandle}>{creator.handle}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function ExploreScreen() {
  const loadRequestId = useRef(0);
  const hasRenderedContentRef = useRef(false);
  const params = useLocalSearchParams<{ content?: string }>();
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
  ] =
    useState<
      PublicCanalScene[]
    >([]);

  const [stages, setStages] = useState<LiveStage[]>([]);
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [stageFacet, setStageFacet] = useState<StageFacet>({ kind: "all" });

  const [
    activeContent,
    setActiveContent,
  ] =
    useState<ExploreContent>(
      params.content === "stages" ? "stages" : "scenes",
    );

  useEffect(() => {
    if (params.content === "stages" || params.content === "scenes") {
      setActiveContent(params.content);
    }
  }, [params.content]);

  const [
    query,
    setQuery,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    savingKey,
    setSavingKey,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    loadErrors,
    setLoadErrors,
  ] = useState<{
    scenes:
      RecoveryIssue | null;
    stages:
      RecoveryIssue | null;
  }>({
    scenes: null,
    stages: null,
  });

  const load =
    useCallback(
      async (mode: "initial" | "refresh" = "initial"): Promise<void> => {
        const requestId = ++loadRequestId.current;
        const isPullRefresh = mode === "refresh";

        setRefreshing(isPullRefresh);

        if (!isPullRefresh && !hasRenderedContentRef.current) {
          setLoading(true);
        }

        setLoadErrors({
          scenes: null,
          stages: null,
        });

        const [
          sceneResult,
          stageResult,
          tasteResult,
        ] =
          await Promise.allSettled([
            loadExploreScenes({ force: isPullRefresh }),
            readPublicLiveStages({ force: isPullRefresh }),
            readSpotifyLibrarySnapshot(),
          ]);

        if (
          loadRequestId.current !==
          requestId
        ) {
          return;
        }

        const tasteSnapshot =
          tasteResult.status ===
          "fulfilled"
            ? tasteResult.value
            : null;

        if (
          sceneResult.status ===
          "fulfilled"
        ) {
          hasRenderedContentRef.current = true;
          setScenes(
            rankExploreScenes(
              sceneResult.value,
              tasteSnapshot,
            ),
          );
        } else {
          setLoadErrors(
            (current) => ({
              ...current,

              scenes:
                classifyRecoveryIssue(
                  sceneResult.reason,
                  {
                    service:
                      "canal",
                    connectivityStatus,
                  },
                ),
            }),
          );
        }

        if (stageResult.status === "fulfilled") {
          hasRenderedContentRef.current = true;
          const publicStages = rankExploreStages(
            stageResult.value,
            tasteSnapshot,
          );
          setStages(publicStages);

          void (async () => {
            const hydratedStages: LiveStage[] = [];
            for (let offset = 0; offset < publicStages.length; offset += 4) {
              const batch = publicStages.slice(offset, offset + 4);
              hydratedStages.push(...await Promise.all(
                batch.map((stage) => addSpotifyArtworkToLiveStage(
                  stage,
                  [stage.currentTrackIndex],
                )),
              ));
            }

            if (loadRequestId.current === requestId) {
              setStages(
                rankExploreStages(
                  hydratedStages,
                  tasteSnapshot,
                ),
              );
            }
          })().catch(() => undefined);
        } else {
          setLoadErrors((current) => ({
            ...current,
            stages: classifyRecoveryIssue(stageResult.reason, {
              service: "canal",
              connectivityStatus,
            }),
          }));
        }

        setLoading(
          false,
        );

        setRefreshing(
          false,
        );
      },
      [
        connectivityStatus,
      ],
    );

  useFocusEffect(
    useCallback(
      () => {
        void load();
        return () => {
          loadRequestId.current += 1;
        };
      },
      [
        load,
      ],
    ),
  );

  useReconnectReload(
    load,
  );

  const filteredScenes =
    useMemo(
      () => {
        const needle = query.trim().toLowerCase();
        return scenes.filter((item) => {
          const matchesQuery = !needle || [
            item.scene.name,
            item.scene.activity,
            item.scene.emotions,
            item.scene.genres,
            item.creator.displayName,
            item.creator.handle,
            ...item.scene.tracks.map((track) => `${track.title} ${track.artist}`),
          ].join(" ").toLowerCase().includes(needle);
          return matchesQuery;
        });
      },
      [
        query,
        scenes,
      ],
    );

  const activityFacets = useMemo(
    () => topFacetValues(scenes.map((item) => item.scene.activity).filter(Boolean)),
    [scenes],
  );
  const moodFacets = useMemo(
    () => topFacetValues(scenes.flatMap((item) => splitFacetValues(item.scene.emotions))),
    [scenes],
  );
  const genreFacets = useMemo(
    () => topFacetValues(scenes.flatMap((item) => splitFacetValues(item.scene.genres))),
    [scenes],
  );
  const verifiedCreators = useMemo(
    () => [...new Map(
      scenes
        .filter((item) => item.creator.isVerified || item.creator.isCanal)
        .map((item) => [item.ownerId, item.creator] as const),
    ).entries()].map(([ownerId, creator]) => ({ ownerId, creator })),
    [scenes],
  );
  const highlightedScenes =
    useMemo(
      () =>
        scenes
          .filter(
            (item) =>
              item.creator.isVerified ||
              item.creator.isCanal,
          )
          .slice(
            0,
            6,
          ),
      [
        scenes,
      ],
    );
  const trendingStages =
    useMemo(
      () =>
        stages.slice(
          0,
          6,
        ),
      [
        stages,
      ],
    );

  const filteredStages = useMemo(() => {
    return filterExploreStages(stages, query, stageFilter, stageFacet);
  }, [query, stageFacet, stageFilter, stages]);

  const stageActivityFacets = useMemo(
    () => topFacetValues(stages.map((stage) => stage.activity).filter(Boolean)),
    [stages],
  );
  const stageMoodFacets = useMemo(
    () => topFacetValues(
      stages
        .flatMap((stage) => stage.atmosphereSignals ?? [])
        .filter((value) => value.trim().length > 1),
    ),
    [stages],
  );

  const activeError =
    loadErrors[
      activeContent
    ];

  const recoverLoad =
    async (): Promise<void> => {
      if (
        activeError?.action ===
        "sign-in"
      ) {
        router.replace(
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
        await load();
      }
    };

  const save =
    async (
      item: PublicCanalScene,
    ): Promise<void> => {
      const key =
        `${item.ownerId}:${item.sceneId}`;

      setSavingKey(
        key,
      );

      setMessage("");
      setErrorMessage("");

      try {
        await savePublicSceneToLibrary(
          item,
        );

        setScenes(
          (current) =>
            current.map(
              (candidate) =>
                candidate.ownerId ===
                  item.ownerId &&
                candidate.sceneId ===
                  item.sceneId
                  ? {
                      ...candidate,

                      savedByMe:
                        true,
                    }
                  : candidate,
            ),
        );

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
        setSavingKey(
          "",
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
      ]}
    >
      <CanalAmbientBackground />
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        refreshControl={
          <RefreshControl
            onRefresh={() => {
              void load("refresh");
            }}
            refreshing={refreshing}
            tintColor={canalDynamicColors.mint}
          />
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={
          false
        }
      >
        <Animated.View
          entering={FadeInUp.duration(260)}
          style={
            styles.header
          }
        >
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>CANAL DISCOVERY</Text>
            <Text
              style={
                styles.title
              }
            >
              Explore
            </Text>

            <Text
              style={
                styles.subtitle
              }
            >
              {activeContent === "scenes"
                ? "Public Scenes shaped by activities, moods, genres, and creators."
                : "See what is happening live across Canal right now."}
            </Text>
          </View>

          <CanalHeaderActions showSettings={false} />

        </Animated.View>

        <Animated.View entering={FadeInUp.duration(260).delay(45)} accessibilityRole="tablist" style={styles.exploreModeSwitch}>
          <Pressable
            accessibilityLabel="Show Scenes"
            accessibilityRole="tab"
            accessibilityState={{ selected: activeContent === "scenes" }}
            onPress={() => setActiveContent("scenes")}
            style={[styles.exploreModeButton, activeContent === "scenes" && styles.exploreModeButtonActive]}
          >
            <Ionicons color={activeContent === "scenes" ? "#173D50" : canalDynamicColors.muted} name="albums-outline" size={18} />
            <Text style={[styles.exploreModeText, activeContent === "scenes" && styles.exploreModeTextActive]}>Scenes</Text>
            <Text style={[styles.exploreModeCount, activeContent === "scenes" && styles.exploreModeCountActive]}>{scenes.length}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Show Live Stages"
            accessibilityRole="tab"
            accessibilityState={{ selected: activeContent === "stages" }}
            onPress={() => setActiveContent("stages")}
            style={[styles.exploreModeButton, activeContent === "stages" && styles.exploreModeButtonLive]}
          >
            <View style={styles.liveDot} />
            <Text style={[styles.exploreModeText, activeContent === "stages" && styles.exploreModeTextLive]}>Live Stages</Text>
            <Text style={[styles.exploreModeCount, activeContent === "stages" && styles.exploreModeCountLive]}>{stages.length}</Text>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(260).delay(80)}>
        <TextInput
          accessibilityLabel={activeContent === "stages" ? "Search Live Stages" : "Search public Scenes"}
          value={
            query
          }
          onChangeText={
            setQuery
          }
          placeholder={activeContent === "stages"
            ? "Search Stages, hosts, activities, songs, or artists"
            : "Search Scenes, activities, moods, genres, or creators"}
          placeholderTextColor={canalDynamicColors.muted}
          autoCapitalize="none"
          autoCorrect={
            false
          }
          style={
            styles.searchInput
          }
        />
        </Animated.View>

        {!loading &&
        !query.trim() ? (
          <Animated.View
            entering={FadeInUp.duration(260).delay(100)}
            style={styles.featureCatalog}
          >
            {activeContent ===
              "scenes" ? (
              <View
                style={styles.featureSection}
              >
                <View
                  style={styles.featureHeading}
                >
                  <Text
                    style={styles.featureHeadingTitle}
                  >
                    Highlighted Scenes
                  </Text>
                  <Text
                    style={styles.featureHeadingMeta}
                  >
                    FOR YOU
                  </Text>
                </View>

                {highlightedScenes.length >
                0 ? (
                  <ScrollView
                    contentContainerStyle={styles.featureRail}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                  >
                    {highlightedScenes.map(
                      (item) => (
                        <HighlightedSceneCard
                          item={item}
                          key={`highlight:${item.ownerId}:${item.sceneId}`}
                        />
                      ),
                    )}
                  </ScrollView>
                ) : (
                  <Text style={styles.featureEmpty}>
                    Verified Scenes will appear here as they match your listening.
                  </Text>
                )}
              </View>
            ) : null}

            <View
              style={styles.featureSection}
            >
              <View
                style={styles.featureHeading}
              >
                <Text
                  style={styles.featureHeadingTitle}
                >
                  Popular Now
                </Text>
                <Text
                  style={styles.featureHeadingMeta}
                >
                  LIVE STAGES
                </Text>
              </View>

              {trendingStages.length >
              0 ? (
                <ScrollView
                  contentContainerStyle={styles.featureRail}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                >
                  {trendingStages.map(
                    (stage) => (
                      <TrendingStageCard
                        key={`trending:${stage.id}`}
                        stage={stage}
                      />
                    ),
                  )}
                </ScrollView>
              ) : (
                <Text style={styles.featureEmpty}>
                  Trending public Stages will appear as listeners go live.
                </Text>
              )}
            </View>
          </Animated.View>
        ) : null}

        {activeContent === "stages" ? (
          <Animated.View entering={FadeInUp.duration(220)}>
            <View style={styles.stageFilters}>
              {(["all", "canal", "verified", "community"] as StageFilter[]).map((value) => (
                <Pressable
                  key={value}
                  accessibilityLabel={`Filter public Stages by ${value}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: stageFilter === value }}
                  onPress={() => setStageFilter(value)}
                  style={[
                    styles.stageFilterButton,
                    stageFilter === value && styles.stageFilterSelected,
                  ]}
                >
                  <Text style={[
                    styles.stageFilterText,
                    stageFilter === value && styles.stageFilterTextSelected,
                  ]}>
                    {value === "all" ? "All" : value.charAt(0).toUpperCase() + value.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.discoveryCatalog}>
              <StageFacetRail
                title="Live activities"
                icon="walk-outline"
                accent="#7FE3CF"
                kind="activity"
                values={stageActivityFacets}
                selected={stageFacet}
                onSelect={(facet) => setStageFacet(
                  facet.kind === "activity"
                    ? { kind: "activity", value: facet.value }
                    : { kind: "all" },
                )}
              />
              <StageFacetRail
                title="Live moods"
                icon="sparkles-outline"
                accent="#FFB7C4"
                kind="mood"
                values={stageMoodFacets}
                selected={stageFacet}
                onSelect={(facet) => setStageFacet(
                  facet.kind === "mood"
                    ? { kind: "mood", value: facet.value }
                    : { kind: "all" },
                )}
              />
            </View>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInUp.duration(240).delay(110)} style={styles.discoveryCatalog}>
            <FacetRail title="Activities" icon="walk-outline" accent="#7FE3CF" kind="activity" values={activityFacets} />
            <FacetRail title="Moods" icon="sparkles-outline" accent="#FFB7C4" kind="mood" values={moodFacets} />
            <FacetRail title="Genres" icon="musical-notes-outline" accent="#FFD37D" kind="genre" values={genreFacets} />
            <VerifiedCreatorRail creators={verifiedCreators} />
          </Animated.View>
        )}

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
          </View>
        ) : null}

        {errorMessage ? (
          <View
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

        {activeError ? (
          <RecoveryNotice
            busy={
              loading
            }
            issue={
              activeError
            }
            onAction={
              recoverLoad
            }
          />
        ) : null}

        {loading ? (
          <View
            style={
              styles.loadingCard
            }
          >
            <ActivityIndicator
              size="large"
            />

            <Text
              style={
                styles.loadingText
              }
            >
              Loading public {activeContent}...
            </Text>
          </View>
        ) : activeError && (
          activeContent === "scenes" ? filteredScenes.length === 0 : filteredStages.length === 0
        ) ? null : activeContent === "stages" && filteredStages.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {query.trim() || stageFilter !== "all" || stageFacet.kind !== "all"
                ? "No matching live Stages"
                : "No public Stages are live"}
            </Text>
            <Text style={styles.emptyText}>
              {query.trim() || stageFilter !== "all" || stageFacet.kind !== "all"
                ? "Try another host, activity, song, artist, or Stage type."
                : "Pull down to refresh. Public Stages will appear here as soon as they go live."}
            </Text>
          </View>
        ) : activeContent === "stages" ? (
          <View style={styles.list}>
            {filteredStages.map((stage, index) => (
              <Animated.View
                entering={FadeInUp.duration(240).delay(Math.min(index, 5) * 35)}
                key={stage.id}
              >
                <PublicStageCard stage={stage} />
              </Animated.View>
            ))}
          </View>
        ) : activeContent === "scenes" && !query.trim() ? null : filteredScenes.length ===
          0 ? (
          <View
            style={
              styles.emptyCard
            }
          >
            <Text
              style={
                styles.emptyTitle
              }
            >
              {query.trim()
                ? "No matching Scenes"
                : "No public Scenes yet"}
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              {query.trim()
                ? "Try another activity, mood, genre, creator, or search."
                : "Change one of your created Scenes to Public in Library. Your own public Scene will appear here so the social flow can be tested before other creators join."}
            </Text>
          </View>
        ) : (
          <View
            style={
              styles.list
            }
          >
            {filteredScenes.map(
              (item) => {
                const key =
                  `${item.ownerId}:${item.sceneId}`;

                return (
                  <PublicSceneCard
                    key={
                      key
                    }
                    item={
                      item
                    }
                    saving={
                      savingKey ===
                      key
                    }
                    onSave={() =>
                      void save(
                        item,
                      )
                    }
                  />
                );
              },
            )}
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
        "transparent",
    },

    liveFeature: {
      minHeight: 168,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      borderRadius: 27,
      borderCurve: "continuous",
      backgroundColor: canalDynamicColors.surface,
      padding: 18,
      justifyContent: "flex-end",
      boxShadow: "0 18px 42px rgba(35, 15, 55, 0.22)",
    },

    liveFeatureGlow: {
      position: "absolute",
      left: -30,
      right: -30,
      height: 76,
      top: 10,
      transform: [{ rotate: "-6deg" }],
      backgroundColor: "rgba(255, 188, 177, 0.18)",
    },

    featureKicker: {
      color: "#D7FFF6",
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1.7,
    },

    featureTitle: {
      color: canalDynamicColors.text,
      fontFamily: "Georgia",
      fontSize: 29,
      fontWeight: "500",
      letterSpacing: -0.6,
      marginTop: 7,
    },

    featureText: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      lineHeight: 18,
      maxWidth: 290,
      marginTop: 6,
    },

    featureButton: {
      minHeight: 48,
      alignSelf: "flex-start",
      justifyContent: "center",
      borderRadius: 15,
      backgroundColor: "rgba(219,255,248,0.92)",
      paddingHorizontal: 16,
      marginTop: 15,
    },

    featureButtonText: {
      color: "#153F50",
      fontSize: 11,
      fontWeight: "900",
    },

    content: {
      paddingHorizontal: 20,
      paddingTop: 0,
      paddingBottom: 120,
      gap: 11,
    },

    featureCatalog: {
      gap: 22,
      paddingTop: 5,
    },

    featureSection: {
      gap: 9,
    },

    featureHeading: {
      minHeight: 32,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },

    featureHeadingTitle: {
      color: canalDynamicColors.text,
      fontFamily: "Georgia",
      fontSize: 22,
      fontWeight: "500",
    },

    featureHeadingMeta: {
      color: canalDynamicColors.muted,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 1.2,
    },

    featureRail: {
      gap: 10,
      paddingRight: 20,
      paddingBottom: 3,
    },

    featureEmpty: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      lineHeight: 17,
      paddingVertical: 10,
    },

    highlightedCard: {
      width: 208,
      minHeight: 172,
      overflow: "hidden",
      justifyContent: "space-between",
      borderRadius: 24,
      borderCurve: "continuous",
      padding: 14,
      boxShadow: "0 13px 30px rgba(2, 28, 47, 0.18)",
    },

    highlightedCreator: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },

    highlightedCreatorName: {
      flex: 1,
      color: canalDynamicColors.text,
      fontSize: 11,
      fontWeight: "800",
    },

    highlightedCopy: {
      gap: 5,
    },

    highlightedName: {
      color: canalDynamicColors.text,
      fontFamily: "Georgia",
      fontSize: 22,
      fontWeight: "500",
      lineHeight: 25,
    },

    highlightedMeta: {
      color: canalDynamicColors.muted,
      fontSize: 10,
    },

    trendingStageCard: {
      width: 190,
      minHeight: 156,
      overflow: "hidden",
      borderRadius: 23,
      borderCurve: "continuous",
      padding: 14,
      boxShadow: "0 13px 30px rgba(2, 28, 47, 0.16)",
    },

    trendingLiveLine: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },

    trendingLiveText: {
      color: canalDynamicColors.danger,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 1.1,
    },

    trendingAudience: {
      flex: 1,
      color: canalDynamicColors.muted,
      fontSize: 9,
      textAlign: "right",
    },

    trendingStageName: {
      color: canalDynamicColors.text,
      fontFamily: "Georgia",
      fontSize: 21,
      fontWeight: "500",
      lineHeight: 24,
      marginTop: 27,
    },

    trendingStageMeta: {
      color: canalDynamicColors.muted,
      fontSize: 10,
      marginTop: 7,
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
      color: canalDynamicColors.text,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 2.1,
      marginBottom: 8,
    },

    title: {
      color: canalDynamicColors.text,
      fontSize: 38,
      fontWeight: "500",
      letterSpacing: -1.1,
    },

    subtitle: {
      color: canalDynamicColors.muted,
      fontSize: 13,
      marginTop: 3,
      lineHeight: 19,
    },

    exploreModeSwitch: {
      flexDirection: "row",
      gap: 7,
      padding: 5,
      borderRadius: 22,
      borderCurve: "continuous",
      backgroundColor: "rgba(5, 37, 58, 0.42)",
    },

    exploreModeButton: {
      flex: 1,
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      borderRadius: 18,
    },

    exploreModeButtonActive: {
      backgroundColor: "rgba(226, 255, 249, 0.94)",
    },

    exploreModeButtonLive: {
      backgroundColor: "rgba(92, 21, 48, 0.76)",
    },

    exploreModeText: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      fontWeight: "900",
    },

    exploreModeTextActive: {
      color: "#173D50",
    },

    exploreModeTextLive: {
      color: "#FFE8E5",
    },

    exploreModeCount: {
      minWidth: 23,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 12,
      overflow: "hidden",
      color: canalDynamicColors.muted,
      backgroundColor: "rgba(255,255,255,0.09)",
      fontSize: 9,
      fontWeight: "900",
      textAlign: "center",
      fontVariant: ["tabular-nums"],
    },

    exploreModeCountActive: {
      color: "#173D50",
      backgroundColor: "rgba(23,61,80,0.11)",
    },

    exploreModeCountLive: {
      color: "#FFE8E5",
      backgroundColor: "rgba(255,255,255,0.13)",
    },

    discoveryCatalog: {
      gap: 14,
      paddingVertical: 4,
    },

    discoverySection: {
      gap: 8,
    },

    discoveryHeading: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },

    discoveryIcon: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },

    verifiedDiscoveryIcon: {
      backgroundColor: "rgba(91, 175, 255, 0.17)",
    },

        discoveryTitle: {
          flex: 1,
          color: canalDynamicColors.text,
      fontSize: 15,
      fontWeight: "900",
    },

    discoveryRail: {
      gap: 8,
      paddingRight: 20,
    },

    categoryCard: {
      width: 64,
      minHeight: 84,
      alignItems: "center",
      justifyContent: "flex-start",
      gap: 5,
      paddingTop: 2,
    },

        discoveryAllButton: {
          width: 48,
          height: 48,
          alignItems: "center",
          justifyContent: "center",
          marginVertical: -7,
          marginRight: -8,
        },

        categoryArtwork: {
          width: 78,
          height: 78,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 22,
      borderCurve: "continuous",
    },

    categoryOrb: {
      position: "absolute",
      borderRadius: 99,
    },

    categoryOrbOne: {
      width: 48,
      height: 48,
      left: -15,
      bottom: -17,
    },

    categoryOrbTwo: {
      width: 38,
      height: 38,
      right: -10,
      top: -9,
    },

    categoryCardLabel: {
      width: 64,
      color: canalDynamicColors.text,
      fontSize: 10,
      fontWeight: "600",
      textAlign: "center",
      textTransform: "capitalize",
    },

    categoryGlyph: {
      textShadowColor: "rgba(27,39,78,0.28)",
      textShadowOffset: { width: 0, height: 7 },
      textShadowRadius: 9,
    },

    categorySelectedDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
    },

    discoveryChip: {
      minHeight: 48,
      minWidth: 86,
      maxWidth: 180,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 14,
      borderWidth: 1,
      borderRadius: 17,
      borderCurve: "continuous",
    },

    discoveryChipText: {
      color: canalDynamicColors.text,
      fontSize: 11,
      fontWeight: "800",
      textTransform: "capitalize",
    },

    creatorRail: {
      gap: 9,
      paddingRight: 20,
    },

    creatorDiscoveryCard: {
      width: 118,
      minHeight: 112,
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      padding: 10,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      borderRadius: 19,
      borderCurve: "continuous",
      backgroundColor: canalDynamicColors.surface,
    },

    creatorDiscoveryCardSelected: {
      borderColor: "#71B7FF",
      backgroundColor: "rgba(113, 183, 255, 0.16)",
    },

    creatorDiscoveryName: {
      width: "100%",
      color: canalDynamicColors.text,
      fontSize: 11,
      fontWeight: "900",
      textAlign: "center",
    },

    creatorDiscoveryHandle: {
      width: "100%",
      color: canalDynamicColors.muted,
      fontSize: 9,
      textAlign: "center",
    },

    refreshButton: {
      borderWidth: 1,
      borderColor:
        "#E2DAD4",
      borderRadius: 14,
      backgroundColor: canalDynamicColors.surface,
      paddingHorizontal: 13,
      paddingVertical: 10,
    },

    refreshText: {
      color: canalDynamicColors.gold,
      fontSize: 11,
      fontWeight: "900",
    },

    searchInput: {
      minHeight: 49,
      borderWidth: 1,
      borderColor:
        canalDynamicColors.line,
      borderRadius: 18,
      backgroundColor: canalDynamicColors.surface,
      color: canalDynamicColors.text,
      fontSize: 15,
      fontWeight: "500",
      letterSpacing: -0.2,
      lineHeight: 20,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginBottom: 0,
    },

    segmentedControl: {
      flexDirection: "row",
      borderRadius: 16,
      backgroundColor:
        "rgba(5, 37, 58, 0.42)",
      padding: 4,
      marginBottom: 0,
      gap: 4,
    },

    segmentButton: {
      minHeight: 42,
      flex: 1,
      flexDirection: "row",
      alignItems:
        "center",
      justifyContent:
        "center",
      borderRadius: 13,
      gap: 4,
    },

    segmentButtonActive: {
      backgroundColor: canalDynamicColors.surface,
    },

    segmentText: {
      color: canalDynamicColors.muted,
      fontSize: 12,
      fontWeight: "800",
    },

    segmentTextActive: {
      color: canalDynamicColors.text,
    },

    segmentCount: {
      minWidth: 19,
      borderRadius: 99,
      backgroundColor:
        "rgba(219, 255, 248, 0.16)",
      color: "#625B55",
      fontSize: 9,
      fontWeight: "900",
      textAlign: "center",
      paddingHorizontal: 6,
      paddingVertical: 3,
      overflow: "hidden",
    },

    segmentCountActive: {
      backgroundColor: canalDynamicColors.warningSurface,
      color: "#123F54",
    },

    list: {
      gap: 14,
    },

    editorialFeature: {
      overflow: "hidden",
      borderRadius: 27,
      borderCurve: "continuous",
      boxShadow: "0 18px 42px rgba(32, 15, 52, 0.2)",
    },

    stageFilters: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
    },

    stageFilterButton: {
      minHeight: 48,
      justifyContent: "center",
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      borderRadius: 18,
      backgroundColor: canalDynamicColors.surface,
      paddingHorizontal: 13,
    },

    stageFilterSelected: {
      backgroundColor: "rgba(244, 255, 252, 0.92)",
    },

    stageFilterText: {
      color: canalDynamicColors.muted,
      fontSize: 10,
      fontWeight: "800",
    },

    stageFilterTextSelected: {
      color: "#3D3457",
    },

    stageResult: {
      position: "relative",
      overflow: "hidden",
      minHeight: 260,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      borderRadius: 27,
      borderCurve: "continuous",
      backgroundColor: canalDynamicColors.surface,
      padding: 18,
      boxShadow: "0 18px 42px rgba(35, 15, 55, 0.2)",
    },

    stageResultGlow: {
      position: "absolute",
      width: 210,
      height: 210,
      borderRadius: 105,
      top: -80,
      right: -58,
      backgroundColor: "rgba(255, 184, 169, 0.28)",
    },

    stageResultTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },

    liveBadge: {
      minHeight: 28,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 14,
      backgroundColor: "rgba(102, 22, 47, 0.64)",
      paddingHorizontal: 9,
    },

    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: "#FF8A83",
    },

    liveBadgeText: {
      color: "#FFE8E5",
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 1.2,
    },

    stageProvenance: {
      color: "#D4FFF5",
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 1.1,
    },

    stageAudience: {
      flex: 1,
      color: "rgba(255,255,255,0.72)",
      fontSize: 9,
      textAlign: "right",
    },

    stageResultName: {
      color: canalDynamicColors.text,
      fontFamily: "Georgia",
      fontSize: 29,
      fontWeight: "500",
      letterSpacing: -0.6,
      marginTop: 18,
    },

    stageResultMeta: {
      flex: 1,
      color: canalDynamicColors.muted,
      fontSize: 11,
    },

    stageHostIdentity: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      marginTop: 8,
    },

    stageNowPlaying: {
      minHeight: 78,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
      borderRadius: 18,
      backgroundColor: canalDynamicColors.surface,
      padding: 10,
      marginTop: 18,
    },

    stageArtwork: {
      width: 55,
      height: 55,
      borderRadius: 13,
    },

    stageArtworkFallback: {
      width: 55,
      height: 55,
      borderRadius: 13,
      backgroundColor: "rgba(202, 255, 244, 0.18)",
    },

    stageTrackCopy: {
      flex: 1,
      minWidth: 0,
    },

    stageTrackKicker: {
      color: canalDynamicColors.mint,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 1.3,
    },

    stageTrackTitle: {
      color: canalDynamicColors.text,
      fontSize: 13,
      fontWeight: "800",
      marginTop: 4,
    },

    stageTrackArtist: {
      color: canalDynamicColors.muted,
      fontSize: 10,
      marginTop: 2,
    },

    stagePlay: {
      color: "#E8FFF9",
      fontSize: 29,
      paddingHorizontal: 5,
    },

    card: {
      backgroundColor: canalDynamicColors.surface,
      borderRadius: 22,
      borderCurve: "continuous",
      borderWidth: 1,
      overflow: "hidden",
      padding: 15,
      boxShadow: "0 14px 34px rgba(3, 18, 39, 0.2)",
    },

    scenePressable: {
      borderRadius: 17,
    },

        cardTop: {
      flexDirection: "row",
      alignItems:
        "center",
        },
        publicSceneEnergy: {
          width: 112,
          marginTop: 10,
        },
        publicSceneBreakdowns: {
          flexDirection: "row",
          gap: 10,
          marginTop: 8,
          maxWidth: 220,
        },
        publicSceneBreakdown: { flex: 1 },

    artwork: {
      width: 64,
      height: 64,
      borderRadius: 18,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor: canalDynamicColors.warningSurface,
      marginRight: 13,
    },

    artworkText: {
      color: canalDynamicColors.gold,
      fontSize: 25,
      fontWeight: "900",
    },

    cardText: {
      flex: 1,
    },

    sceneName: {
      color: canalDynamicColors.text,
      fontSize: 17,
      fontWeight: "900",
    },

    sceneMeta: {
      color: canalDynamicColors.muted,
      fontSize: 11,
      marginTop: 4,
    },

    artistText: {
      color: canalDynamicColors.muted,
      fontSize: 10,
      marginTop: 4,
    },

    creatorRow: {
      flexDirection: "row",
      alignItems:
        "center",
      borderTopWidth: 1,
      borderTopColor:
        "rgba(255,255,255,0.18)",
      marginTop: 14,
      paddingTop: 12,
    },

    creatorButton: {
      flex: 1,
      minHeight: 48,
      flexDirection: "row",
      alignItems:
        "center",
      gap: 9,
    },

    creatorText: {
      flex: 1,
    },

    creatorName: {
      color: canalDynamicColors.text,
      fontSize: 12,
      fontWeight: "900",
    },

    creatorHandle: {
      color: canalDynamicColors.muted,
      fontSize: 10,
      marginTop: 2,
    },

    saveButton: {
      minWidth: 68,
      minHeight: 48,
      borderRadius: 13,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#F47A24",
      paddingHorizontal: 12,
      marginLeft: 10,
    },

    saveButtonDisabled: {
      backgroundColor:
        canalDynamicColors.surface,
    },

    saveButtonText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "900",
    },

    loadingCard: {
      minHeight: 180,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor: canalDynamicColors.surface,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
    },

    loadingText: {
      color: canalDynamicColors.muted,
      fontSize: 13,
      marginTop: 12,
    },

    emptyCard: {
      backgroundColor: canalDynamicColors.surface,
      borderRadius: 22,
      padding: 22,
      borderWidth: 1,
      borderColor: canalDynamicColors.line,
    },

    emptyTitle: {
      color: canalDynamicColors.text,
      fontSize: 18,
      fontWeight: "900",
    },

    emptyText: {
      color: canalDynamicColors.muted,
      fontSize: 13,
      lineHeight: 20,
      marginTop: 7,
    },

    successBox: {
      backgroundColor: canalDynamicColors.successSurface,
      borderRadius: 15,
      padding: 13,
      marginBottom: 13,
    },

    successText: {
      color: "#1D7138",
      fontSize: 12,
      lineHeight: 18,
    },

    errorBox: {
      backgroundColor: canalDynamicColors.dangerSurface,
      borderRadius: 15,
      padding: 13,
      marginBottom: 13,
    },

    errorText: {
      color: canalDynamicColors.danger,
      fontSize: 12,
      lineHeight: 18,
    },

    errorTitle: {
      color: "#8D211C",
      fontSize: 13,
      fontWeight: "900",
      marginBottom: 4,
    },

    recoveryButton: {
      alignSelf:
        "flex-start",
      borderRadius: 12,
      backgroundColor:
        "#A62E27",
      paddingHorizontal: 12,
      paddingVertical: 9,
      marginTop: 10,
    },

    recoveryButtonText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "900",
    },

    pressed: {
      opacity: 0.7,
    },
  });
